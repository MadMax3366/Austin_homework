# 学生运营系统设计（精简版）

## 1. 业务理解

这不是学生 CRUD，而是一条持续数年的教育服务链路：

> 家长／学生咨询 → 试听 → 报名购课 → 固定班与具体课次 → 老师／学生出勤 → 课堂反馈 → 课时消耗 → 续费、暂停或流失。

系统面对五类使用者：教师、运营管理员、主管管理员、学生／家长，以及负责诊断和恢复的系统管理员。Student 与 Guardian 既是核心业务对象，也是已经实现的受限门户身份。

## 2. 架构选择

当前规模约 1,000 名学生、10 名运营、20 名老师、每周 60 节课，采用模块化单体：一个部署、一个关系数据库、按领域服务隔离。它比微服务更容易维持报名、课时、退款和薪资的一致事务，也更适合 take-home 被面试官直接审查。

请求路径为：

```text
身份提供方 → 账号与角色授权 → 角色工作台 → Route Handler
→ 领域状态机／对象授权 → D1 transaction → audit/outbox → 外部 adapter
```

浏览器只提交意图，不能自报 role、owner、余额、扣课数量或审批权。数据库用 FK、CHECK、UNIQUE 和 trigger 保护应用层可能遗漏或并发穿透的关键不变量。

## 3. 核心模块

| 模块 | 主要事实与规则 |
|---|---|
| 学生与招生 | Student、Guardian、Inquiry、Owner、FollowUp；试听完成且结论为 enrol 才能转正式 |
| 班级与排课 | ClassSeries 是周期计划，LessonSession 是实际课次；试听、正常课、补课、私教共用引擎 |
| 教学履约 | SessionParticipant 冻结历史名单；Attendance 逐人明确；反馈由老师审核 |
| 课时与续费 | 余额由不可变 CreditTransaction 求和；试听不扣，余额不足不开负账 |
| 财务 | Order、PaymentTransaction、Refund；回调去重，全额退款要求购买课时未被消费 |
| 老师薪资 | 完成一个课次只生成一个 PayrollEntry；费率按老师、课次类型和日期选择 |
| 消息与跟进 | FollowUpTask、Message、OutboxEvent；外部失败不回滚已成立的业务事实 |
| 组织与系统 | 角色分配、机构设置、集成健康、后台任务、审计、限时技术支持 |

异常处理和 AI 是横切能力，不单独成为业务孤岛：排课表单内报告冲突，点名内处理零余额，财务内处理退款失败；AI 嵌入反馈和文本草稿，永不决定权限、出勤、计费或审批。

## 4. 关键业务规则

| 规则 | 强制位置 |
|---|---|
| 页面入口、API 和对象范围三次校验角色 | 服务端授权 |
| 老师只能完成自己被分配的课次 | 服务层 + DB trigger |
| 老师、教室、学生时间区间均不得重叠；相邻边界允许 | 服务层预检 + DB trigger |
| 正式生 Present／Late 扣 1，Absent 和试听生不扣 | 参与者计费策略 |
| 出勤、课时、薪资、审计、完成状态全成或全回滚 | D1 batch transaction |
| 支付 provider event 只处理一次；账本 source 唯一 | UNIQUE + replay receipt |
| 退款申请者不能审批自己的退款 | 服务端职责分离 |
| 薪资只能 open → approved → paid，paid 后不可改删 | 状态机 trigger |
| 系统管理员默认无业务写权；应急支持需独立审批、scope、到期时间和审计 | break-glass 模型 |
| LLM 输出必须结构校验且可编辑；失败走本地 fallback | AI adapter 边界 |

## 5. 重要建模决定

- `ClassSeries.sessionKind` 是班级默认值，`LessonSession.sessionKind` 是历史快照，允许具体课次覆盖。
- 试听与正常课使用同一排课、名单、出勤和计薪引擎；差异落在 participant billing policy 和 pay rate，而不是复制两套流程。
- `CreditTransaction`、`PaymentTransaction`、`AuditEvent` 不更新、不删除；纠错通过 reversal 或新事件表达。
- Guardian 通过 `guardian_id → student_guardians` 获取多个孩子，不能在 role assignment 中硬绑一个孩子。
- 系统管理员和主管是独立授权含义；同一自然账号即使同时持有两种角色，也不能自批自己的 break-glass。

## 6. 错误与恢复

- 401 未登录、403 无角色／对象越权、409 状态或并发冲突、422 输入／业务校验、413 body 过大、503 仅用于真实基础设施不可用。
- 每个错误带稳定 code 与 request ID；前端保留表单并允许安全重试。
- 课次完成使用 Idempotency-Key 与 request hash；支付使用 provider event；其余高风险命令由唯一业务键和状态机保证单一赢家。
- Outbox 把“业务事实提交”与“外部消息发送”分开；当前 worker 为 sandbox，失败可重试而不重复业务写入。

## 7. 需要产品方确认

1. 请假、迟到、no-show、补课分别如何扣课和计薪？
2. 课时属于学生、家庭、课程还是课包，是否过期或可转让？
3. 部分退款、手续费、已消费课时的退款如何分摊？
4. 老师纠错窗口多长，超过窗口由谁审批？
5. 家长反馈是否逐学生、是否需要双人审核，以及各消息渠道的同意与退订规则？

这些未确认政策不会被伪装成“已知需求”；当前实现给出安全默认值，并把策略集中在领域服务和机构设置中。
