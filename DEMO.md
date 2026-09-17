# Vertical Slice Demo Proposal

## 目标

用 10 分钟证明一条窄但完整的全栈业务链路：

> 老师完成一节课的点名；系统在可信服务端边界内保存事实、扣减课时、生成异常、记录审计，并让 AI 失败不影响主流程。

## 为什么选它

- 直接解决“老师不知道今天谁是新来的”和“课时用完才发现”的痛点。
- 同时展示 ClassSeries／LessonSession、Enrollment／名单快照、Attendance／Ledger 的建模判断。
- 可以被直接 API 破坏测试，能证明权限、事务、幂等和数据库约束不是前端假象。
- LLM 位于省人工但不控制业务的位置。

## 10 分钟主流程

| 时间 | 操作 | 需要讲出的设计点 |
|---:|---|---|
| 0:00 | Teacher 登录 | 身份来自服务端；浏览器不能自报角色 |
| 0:30 | 查看今天课次 | “今天”固定按 Melbourne；只返回自己的课 |
| 1:00 | 打开课程名单 | 名单来自 SessionParticipant snapshot，不被以后退班改写 |
| 2:00 | 逐人标记 Present／Late／Absent | 初始为未点名；不能误触全班扣课 |
| 3:00 | 展示低余额学生 | 余额由不可变流水求和，不存可变 remainingCredits |
| 3:30 | 输入课堂事实并生成 AI 草稿 | 脱敏、JSON Schema、Zod、可编辑、人审 |
| 4:30 | 打开最终确认 | 汇总出勤、扣课数和余额异常 |
| 5:00 | 完成课程 | 原子 claim → attendance → ledger／exception → audit → complete |
| 6:00 | 刷新完成页面 | 证明真实持久化；完成状态只读 |
| 6:30 | 展示零余额结果 | 出勤事实保留，不开负账，BillingException 可处理 |
| 7:30 | 执行 3 个破坏测试 | 越权、重复请求、非法名单 |
| 9:00 | 关闭 LLM key 再生成 | 返回 fallback，点名完全不受影响 |

## 成功判据

- 刷新后数据仍在。
- Teacher B 的 Session 对 Teacher A 返回 403 且数据库零写入。
- 同 Idempotency-Key + 同 payload 返回相同 receipt，流水只增加一次。
- 同 key + 不同 payload 返回 409。
- 非名单、遗漏、重复学生返回 422。
- 余额 0 的 Present 保存 Attendance、无负数流水、产生一个 open exception。
- 任一 SQL statement 失败时，Session、Attendance、Ledger、Audit 全部回滚。
- LLM 任意失败时仍能完成课程。

## 明确非目标

本次 Demo 不假装已经实现完整 CRM、试听、支付、排课、家长门户或消息发送。面试时展示完整架构和演进位置，但代码只承诺上述链路。
