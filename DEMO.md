# 面试演示脚本

## 主 Demo：10 分钟教师履约切片

| 时间 | 操作 | 要讲的判断 |
|---:|---|---|
| 0:00 | 登录并进入角色选择 | 一个身份可有多职责；服务端每次重新授权 |
| 0:40 | 进入教师工作台 | Melbourne 业务日，只返回自己的课；同时显示个人薪资摘要 |
| 1:20 | 打开名单 | 名单来自 SessionParticipant snapshot，退班不会改写历史 |
| 2:00 | 展示正式生和试听生 | 同一引擎；试听标签明确且不扣课时 |
| 2:40 | 点名 Present／Late／Absent | 初始未点名，不能默认全班 Present |
| 3:30 | 展示余额预警和零余额 | 余额由不可变流水求和；余额不足仍保留真实出勤 |
| 4:20 | 输入课堂事实并生成反馈 | AI 只产出可编辑草稿；失败走 fallback |
| 5:20 | 最终确认并完成 | Attendance、Credit／Exception、Payroll、Audit、Outbox 原子提交 |
| 6:20 | 刷新 | 证明真实持久化；完成后只读 |
| 7:00 | 打开主管异常队列 | 零余额生成 BillingException，不出现负数 |
| 8:00 | 重放同一请求 | 相同 key 安全 replay；跨课次复用返回 409 |
| 9:00 | 尝试另一老师的课 | 404／403 且零写入 |

## 完整业务链：额外 5 分钟

1. 运营新建咨询：一次生成 prospect、guardian、credit account、inquiry、follow-up 和 audit。
2. 安排试听：故意制造老师重叠，展示 409 和明确错误码；换时间成功。
3. 对已完成出勤的试听记录“attended + enrol”，再转正式班；系统生成 Enrollment 和待支付订单。
4. 切到学生／家长门户，家长在多个孩子之间切换，创建订单并用 sandbox 支付；重复回调不重复入课时。
5. 运营发起退款，主管审批；展示申请者不能自批、已消费课时不能直接冲成负数。
6. 主管审批并支付薪资周期；paid 后数据库拒绝修改。
7. 系统管理员运行 outbox、申请限时支持；同一账号切到 Manager 自批时返回 409，独立主管才能批准。

## 必须主动展示的破坏测试

| 攻击 | 预期 |
|---|---|
| 学生调用 `create_inquiry` | 403 ROLE_FORBIDDEN |
| 家长传入未关联 `studentId` | 403 STUDENT_SCOPE_FORBIDDEN |
| Evil Origin 发写请求 | 403 CROSS_ORIGIN_REQUEST_REJECTED |
| 同老师／教室／学生重叠排课 | 409；数据库无新课次 |
| 试听未点名先写“attended” | 409 TRIAL_ATTENDANCE_REQUIRED |
| Cancelled／no-show 直接 enrol | 422 INVALID_TRIAL_DECISION |
| 同 payment event 换订单 | 409 PAYMENT_EVENT_REUSED |
| 重复批准退款／支付薪资 | 409 状态冲突 |
| 更新任意机构 setting key | 422 SETTING_NOT_ALLOWED |
| 系统管理员自批 break-glass | 409 SEPARATION_OF_DUTIES |

## 演示成功判据

- 每次刷新后状态保持。
- 预期失败返回 403／409／422，而不是 500。
- 支付 replay 只有一条 PaymentTransaction 和一条 purchase ledger。
- 试听参与者没有 attendance debit；每个课次最多一条 PayrollEntry。
- `PRAGMA foreign_key_check` 为空，所有课时账户余额均不小于 0。
- Outbox 重跑返回 0 个新处理项，不重复发送业务事件。

不要声称 sandbox 是真实支付或真实短信。它展示的是 adapter 契约、事务边界、幂等和失败恢复；真实 provider 接入是独立上线工作。
