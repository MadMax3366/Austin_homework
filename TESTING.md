# 测试与对抗验证

## 1. 自动化层级

| 层级 | 命令 | 覆盖 |
|---|---|---|
| 领域／HTTP 单测 | `npm test` | Zod、计费、日期、body 实际字节、same-origin、错误契约 |
| SQLite 契约 | `npm test` | 全迁移、0006 升级、FK/CHECK/UNIQUE/trigger、状态机、不可变性 |
| 六角色 HTTP E2E | `npm run test:e2e` | 生产构建上的页面、overview、15 类命令和老师专用流程 |
| 静态与构建 | `npm run lint && npx tsc --noEmit && npm run build` | Client/Server 边界、类型、全部路由产物 |
| 许可边界 | `npm run check:license` | 专有声明、package metadata 和两份第三方 MIT license 哈希 |

E2E 要在全新临时 D1 上顺序应用 0000–0011、连续执行两次 seed、启动 `dist/server` 后运行，不能复用开发者已经修改过的数据。

## 2. 六角色 E2E 覆盖

- 教师：自己的课表／名单／薪资、AI 或 fallback、完成两节课、exact replay、跨课次 key、越权课次。
- 运营：明确的试听完成待跟进／owner-scoped 低课时队列、咨询、试听、冲突、转正式、跟进、续费订单、退款申请和跨 owner 拦截。
- 主管：课时异常、退款审批、setting allowlist、薪资 open → approved → paid、支持审批。
- 学生：本人 overview、下单、支付、回调 replay、伪造其他学生、批准 FAQ 回答和敏感问题转人工。
- 家长：多孩子切换、关联孩子下单支付、未关联孩子拒绝、FAQ 对象范围。
- 系统管理员：overview、outbox、限时支持、业务写入拒绝、自批拒绝、独立主管批准。

最终一次 clean-state 运行通过 70 个 HTTP 场景（含预期的 403／404／409／422），并在所有写操作后再次加载每个工作台。

## 3. 数据库事后不变量

E2E 后必须额外查询：

| 不变量 | 期望 |
|---|---:|
| `PRAGMA foreign_key_check` | 0 行 |
| 负课时账户 | 0 |
| 同 provider event 的支付流水 | 1 |
| 同订单的 purchase ledger | 1 |
| 被扣课时的试听参与者 | 0 |
| 一课次多条薪资 | 0 |
| 同系统管理员同时 active 支持会话 | ≤ 1 |
| worker 后 pending／failed／processing outbox | 0 |
| FAQ 批准答案 / owner 人工转接 | 各 1；handoff 同时有 task + message |
| 跨 owner 续费订单 | 0 |

## 4. 主要破坏矩阵

| 类别 | 攻击 | 预期 |
|---|---|---|
| 身份 | 无登录、disabled account、suspended organization | 401／403 |
| 角色 | 学生招生、系统管理员改业务设置 | 403 |
| 对象 | 老师猜他人 session、家长猜其他学生 | 404／403，零泄露 |
| 输入 | 非 JSON、额外字段、非法金额、超过 64 KiB 实际 UTF-8 | 400／422／413 |
| CSRF | Origin 不同；无 Origin 但 `Sec-Fetch-Site: cross-site` | 403 |
| 排课 | 教师、教室、学生重叠；相邻 `end == start` | 重叠 409，相邻允许 |
| 试听 | 未完成点名先写结果；cancelled 直接 enrol | 409／422 |
| 点名 | 漏学生、塞非名单、旧版本、取消课次 | 422／409，事务回滚 |
| 课时 | 零余额 present、两个课次争最后一课时 | Exception；余额不负 |
| 支付 | webhook 重放、同 event 换订单 | replay／409 |
| 退款 | 非 paid、重复、金额过大、课时已消费、自批 | 409／422，零半成品 |
| 薪资 | 重叠费率、重叠周期、跳状态、改 paid entry | DB 拒绝 |
| 系统 | 重复 support、自批、非法 scope、重复 outbox | 409／422／安全空跑 |
| AI | 无 key、超时、429、非法结构、敏感内容 | fallback，不影响主流程 |
| FAQ | 提示注入、无批准条目、退款／改课／医疗问题、未关联孩子 | canonical FAQ 或原子转人工；对象越权 403 |

## 5. 尚需生产环境补充

- 两个独立 Worker 的真实并发压测，而不是单进程顺序请求。
- 真实 payment webhook 签名、乱序事件、对账差异和 provider outage。
- Outbox lease、指数退避、dead-letter 和 Worker 崩溃恢复。
- 浏览器级可访问性／键盘／移动端自动化；当前已有 SSR、client build 和 HTTP E2E。
- 双租户数据隔离、备份恢复、告警演练和数据保留／删除政策。
