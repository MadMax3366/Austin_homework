# 面试演示脚本

## Part B 主 Demo：10 分钟 Admin 行动中心

| 时间 | 操作 | 要讲的判断 |
|---:|---|---|
| 0:00 | 登录并选择运营角色 | 可信身份和角色来自服务端；同一账号可有多职责，但每次 API 都重新授权 |
| 0:40 | 打开运营首页 | 第一屏显示“我的学生 100／全机构 1,000”；10 位运营各 100 人，不把低课时队列数量误当总人数 |
| 1:10 | 在“学生与课时”搜索并翻页 | 查询在服务端参数化执行；全机构可见，写操作仍按 owner 授权 |
| 1:40 | 查看“试听完成待跟进” | 聚合“已上试听但结果未录”和“结果已录但人工 follow-up 仍 open”，不用跨 Tab 拼信息 |
| 2:20 | 记录试听 attended + enrol | 老师必须先完成出勤；服务端状态机拒绝提前或 cancelled 直接 enrol |
| 3:10 | 完成试听跟进并转正式 | 更新任务、招生状态、Enrollment 和首期待付订单，全部留审计 |
| 4:20 | 查看“低课时学生（≤3）” | 只列 active 且归当前 Admin owner 的学生；阈值来自机构设置，不包含 prospect |
| 5:10 | 为低课时学生准备续费订单 | Admin 只建 pending 订单，不替家长扣款；跨 owner studentId 返回 403 |
| 6:10 | 切到学生／家长门户支付 | Payment + purchase ledger + outbox 原子写入；相同 provider event 安全 replay |
| 7:00 | FAQ 问“课时怎么扣” | LLM 只选择批准 FAQ；服务端返回 canonical answer，不直接采用自由生成文本 |
| 7:50 | FAQ 问个人退费／余额争议 | policy 直接跳过自动回答，原子创建 Message、FAQInteraction 和 owner FollowUpTask |
| 8:40 | 切回运营任务队列 | 人工 ticket 已出现在当前 Admin 队列，证明“转人工”不是前端提示语 |
| 9:20 | 主动做 owner 越权测试 | 伪造另一 Admin 的 studentId；服务端 403、数据库零写入 |

## 支撑切片：教师履约 5 分钟

1. 教师打开自己的今日课次和冻结名单，新生与余额风险一眼可见。
2. 逐人标记 Present／Late／Absent；试听参与者不扣课时。
3. 输入课堂事实，生成 strict structured output 的可编辑反馈；无 key／失败时使用本地 fallback。
4. 完成课次后原子写 Attendance、Credit／BillingException、Payroll、Audit 和 Outbox。
5. 重放相同 Idempotency-Key 返回稳定 receipt；跨课次复用 key 返回 409。

## 必须主动展示的破坏测试

| 攻击 | 预期 |
|---|---|
| Admin 在全机构目录查看另一个 owner 的学生 | 允许只读查看 |
| Admin 修改另一个 owner 的学生 | 403 STUDENT_SCOPE_FORBIDDEN |
| 学生调用 `create_inquiry` | 403 ROLE_FORBIDDEN |
| 家长传入未关联 `studentId` | 403 STUDENT_SCOPE_FORBIDDEN |
| Evil Origin 发写请求 | 403 CROSS_ORIGIN_REQUEST_REJECTED |
| 同老师／教室／学生重叠排课 | 409；数据库无新课次 |
| 试听未点名先写 attended | 409 TRIAL_ATTENDANCE_REQUIRED |
| Cancelled／no-show 直接 enrol | 422 INVALID_TRIAL_DECISION |
| FAQ 要求退款、改课、医疗／安全建议 | 不自动回答；创建 owner 人工任务 |
| FAQ provider 超时或结构非法 | approved FAQ 本地匹配，否则转人工；业务不中断 |
| 同 payment event 换订单 | 409 PAYMENT_EVENT_REUSED |
| 重复批准退款／支付薪资 | 409 状态冲突 |
| 系统管理员自批 break-glass | 409 SEPARATION_OF_DUTIES |

## 演示成功判据

- Admin 可搜索分页查看 1,000 名学生；本人 100 名与全机构总数清晰；两个行动队列有真实、owner-scoped 数据和可执行动作。
- 刷新后状态保持；预期失败返回 403／409／422，而不是 500。
- FAQ 自动回答只来自批准条目；人工转接能在数据库和运营任务队列中找到。
- 支付 replay 只有一条 PaymentTransaction 和一条 purchase ledger。
- 试听参与者没有 attendance debit；每个课次最多一条 PayrollEntry。
- `PRAGMA foreign_key_check` 为空，所有课时账户余额均不小于 0。

不要声称 sandbox 是已接通的真实支付、银行或消息服务。Payment sandbox 有真实业务副作用；Bank 和消息渠道目前主要是配置／outbox 边界。
