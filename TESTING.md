# Adversarial Test Plan

目标不是只证明 happy path，而是证明绕过 UI 后核心不变量仍成立。

## 1. 权限攻击

| 攻击 | 预期 |
|---|---|
| 未登录 GET workspace | 401；零写入 |
| 停用 staff 使用旧 cookie | 403 |
| Teacher A 猜中 Teacher B 的 Session ID | 403；零写入 |
| payload 伪造 teacherId、role、creditDelta | Schema 拒绝或服务端忽略 |
| 非 Teacher 调用 complete | 403 |
| 枚举不存在／无权资源 | 不返回敏感学生信息 |

## 2. 输入与名单

| 攻击 | 预期 |
|---|---|
| 非 JSON／错误 Content-Type／超大 body | 400／413 |
| 未知 status、空 studentId、重复 student | 422 |
| 漏掉一名 participant | 422 INCOMPLETE_ROSTER |
| 塞入非 participant | 422 STUDENT_NOT_IN_ROSTER |
| 空名单课次 | 明确取消或允许零名单完成，不出现模糊 500 |
| 同学生重叠 active Enrollment | 数据库拒绝 |

## 3. 状态与时间

| 攻击 | 预期 |
|---|---|
| 提前完成未来课次 | 409 SESSION_NOT_STARTED |
| 完成 cancelled Session | UI 只读；API 409 |
| 再次完成已完成 Session | 同请求 replay；其他请求 409 |
| 使用旧 expectedVersion | 数据库内 CAS 失败，整批回滚 |
| Melbourne 午夜前后 replay | 仍返回稳定 receipt |
| 退班后查看历史 | 历史 participant／attendance 不消失 |

## 4. 事务与幂等

| 攻击 | 预期 |
|---|---|
| 双击同一提交 | 一组 Attendance、一次扣课 |
| 同 key、同 payload 并发 | 一个执行，一个稳定 replay |
| 同 key、不同 payload | 409 IDEMPOTENCY_KEY_REUSED |
| Attendance 后模拟 Ledger 失败 | 全部回滚 |
| CAS claim 失败 | 明细零写入 |
| 服务端已提交但响应丢失 | 同 key 重试／GET receipt 对账 |
| 直接重复插入 Ledger source | UNIQUE 拒绝 |

## 5. 课时与纠错

| 攻击 | 预期 |
|---|---|
| 余额 1 的 Present | 成功，余额变 0 |
| 余额 0 的 Present | Attendance + open BillingException；无 debit |
| 余额 0 的 Absent | 保存，无 debit、无 billing exception |
| 两个课次并发消费最后一课时 | 一个 charged，另一个 pending；余额不为负 |
| UPDATE／DELETE 旧 Ledger | trigger 拒绝 |
| 重复处理同一 exception | 幂等或 409 |
| 更正 Present → Absent | 追加 reversal，不改旧流水 |

## 6. LLM 对抗

| 攻击 | 预期 |
|---|---|
| 无 key、DNS、超时、401、429、5xx | 200 fallback + warning |
| 非 JSON、缺字段、额外字段、超长输出 | Schema 拒绝并 fallback |
| Prompt injection | 仍只能返回固定结构，不能改变业务 |
| 笔记含姓名、邮箱、电话、生日、健康关键词 | 脱敏或不调用 provider |
| 连续高频生成 | 用户级限流 |
| AI 成功但点名失败 | 草稿保留，业务不出现半完成 |
| 点名成功但 AI 失败 | 点名结果不变 |

## 7. 前端恢复

| 场景 | 预期 |
|---|---|
| 切换有未保存内容的课次 | 明确确认；取消后保留草稿 |
| 快速切换 A/B 课 | 过期响应不能覆盖当前课 |
| 生成 A 课反馈后切 B | A 的结果不能写入 B |
| 请求超时／离线 | 表单保留，可安全重试 |
| 401 会话过期 | 提供重新登录，草稿可恢复 |
| Cancelled Session | 不显示可编辑控件 |
| 编辑 AI 字段为空／超长 | 字段级错误，不到提交末尾才失败 |

## 8. 回归测试最低线

- 领域单测：状态、计费策略、Schema、Melbourne 时间。
- SQLite 集成：全部 migration、trigger、UNIQUE、rollback、snapshot。
- API 集成：401／403／409／422、幂等、零余额、AI fallback。
- UI 测试：dirty guard、request race、unknown outcome reconciliation。
- 每次提交运行：`npm test`、`npm run lint`、`npm run build`。
