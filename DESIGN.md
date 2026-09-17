# 学生管理系统设计

## 1. 业务理解

系统服务于教育机构的招生与履约，而不是学生表 CRUD。完整生命周期是：咨询 → 试听 → 报名购课 → 固定班 → 具体课次 → 出勤与反馈 → 续费或流失。

角色关注点：

- **Admin／教务**：自己负责的线索、试听、分班、低余额和续费。
- **Teacher**：今天的课、有效名单、新生、点名和课堂反馈。
- **Manager**：负责人转移、课时调整、退款、异常和审计。
- **Student／Guardian**：必须分开建模；首版不登录。

## 2. 第一版范围

实现一条完整垂直切片：

> Teacher 登录 → 查看 Melbourne 当天自己的课次 → 查看冻结名单和余额 → 明确点名 → 原子写入出勤与课时流水／异常 → 保存课堂记录和可编辑 AI 草稿。

暂不实现咨询试听、排课编辑、支付退款、消息发送、家长端、报表和多校区。原因是权限、事务、幂等和可恢复性比页面数量更能证明第一版是否可靠。完整架构见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 3. 数据模型

```text
Student ─< StudentGuardian >─ Guardian
Student ─< Enrollment >─ ClassSeries ─< LessonSession
LessonSession ─< SessionParticipant ─ Attendance
Student ─ CreditAccount ─< CreditTransaction
Attendance ─ 0..1 BillingException
StaffUser ─< LessonSession / AuditEvent
```

- Student 当前 owner 便于查询；生产目标用带起止时间的 `AdminAssignment` 保存转交历史。
- `ClassSeries` 是每周规则，`LessonSession` 是某天实例，可独立取消、改时或代课。
- `SessionParticipant` 在课次形成时冻结，退班不会改写历史名单。
- 课时是不可变账本：PURCHASE `+n`、ATTENDANCE `-1`、ADJUSTMENT `±n`、REVERSAL 反向冲销；余额由流水求和。

## 4. 关键规则

| 规则 | 强制层 |
|---|---|
| 老师只能操作分配给自己的具体课次 | 服务端授权 + DB trigger |
| 名单必须来自 SessionParticipant，且每人恰好一次 | 服务端 + UNIQUE |
| 未来、取消、已完成课次不能再次完成 | 领域状态机 |
| Present／Late 扣 1；Absent 不扣 | 领域计费策略 |
| 出勤、扣课／异常、审计、完成状态全成或全回滚 | D1 transaction |
| 余额不足仍保存真实出勤，不开负账，创建 BillingException | 服务端 + DB trigger |
| 同一 Attendance 最多一笔扣课流水 | UNIQUE source |
| 同 key 同 payload 安全 replay；同 key 不同 payload 返回 409 | CompletionClaim + hash |
| 已完成记录只追加 reversal／纠错，不覆盖历史 | 服务层 + 账本不可变 trigger |
| LLM 只生成草稿；结构校验失败则 fallback，不能决定业务 | 独立 AI 服务 |

## 5. 假设与问题

假设：业务时间统一按 `Australia/Melbourne`；Present／Late 扣一课时，Absent 不扣；余额不足不抹掉出勤事实；老师不能直接修改已完成历史。

最想确认：

1. 请假、no-show、补课和迟到分别如何扣课？
2. 课时属于学生、家庭、课程还是具体课包？是否到期？
3. 零余额是允许欠课、禁止上课，还是进入人工队列？
4. 老师可在多久内纠错，何时需要 Admin／Manager 审批？
5. 反馈发送给谁、通过什么渠道、是否需要审核与同意？

## 6. 页面与信息结构

```text
Sign in
└─ Teacher Today
   ├─ 今日课次：时间、班级、人数、状态
   └─ 当前课次
      ├─ 冻结名单、新生、余额预警
      ├─ Present / Late / Absent（必须逐人确认）
      ├─ 课堂原始笔记 → AI 可编辑草稿
      └─ 最终确认：人数、扣课、待处理异常
```

桌面使用侧栏和工作区；手机端课程切换置顶、学生转为卡片。必须覆盖 loading、无课、无权限、过期登录、冲突、保存失败、网络结果未知、AI 降级和完成只读状态。

## 7. 为什么选择这个切片

它同时验证班级／课次区分、角色化首页、名单历史、对象级权限、课时资金属性、事务、幂等、异常队列和 AI 降级。范围足够窄，可以在固定时间内做透，并允许面试官绕过 UI 直接破坏测试。
