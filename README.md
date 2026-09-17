# Austin Education · Student Operations System

> [!IMPORTANT]
> **PROPRIETARY EVALUATION ARTIFACT — NOT OPEN SOURCE.** Artifact ID `AUS-HOMEWORK-MADMAX3366-2026-09`. Review and execution are governed by [LICENSE.md](./LICENSE.md); third-party carve-outs are listed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

这是一个可运行的模块化全栈作业。教师、运营、主管、学生、家长和系统管理员使用独立账号登录，并进入各自的中文工作台；服务端在每次读取和写入时校验账户、角色与对象范围。

核心业务链路已经接通：

> 咨询 → 试听排课 → 老师点名与反馈 → 试听结论 → 转正式班与首期订单 → 支付入课时 → 正常上课扣课时 → 续费／退款 → 老师计薪 → 消息 outbox 与审计。

相关文档：

- [DESIGN.md](./DESIGN.md)：按题面七项要求整理的 Part A 设计文档。
- [ARCHITECTURE.md](./ARCHITECTURE.md)：五层架构、权限、模块、生命周期与数据设计。
- [宽体架构状态图](./docs/architecture-status.html)：可独立打开的五层架构 HTML。
- [DEMO.md](./DEMO.md)：面试演示脚本和主动破坏测试。
- [TESTING.md](./TESTING.md)：自动化覆盖与对抗测试矩阵。
- [Linux SSD + Mac SSH 隧道部署](./deploy/README.md)：常驻服务和浏览器访问方式。

## 已实现内容

| 工作台 | 可见内容 | 可执行操作 |
|---|---|---|
| 教师 | 今日课表、冻结名单、新生、余额、个人薪资 | 点名、课堂笔记、AI 家长反馈、完成课次 |
| 运营 | 今日待办、学生管理、排课中心、招生试听、课时财务、教师调度 | 搜索详情、加班退班、续费退款、学生转交、试听转正、请假审批与代课安排 |
| 主管 | 10 位运营的学生负载、20 位老师、60 个固定班、冲突、财务与支持申请 | 退款审批、薪资审批／支付、限时支持审批 |
| 学生 | 本人的周／日课表、出勤反馈、课时、订单、消息 | 创建续费订单、支付、帮助中心 |
| 家长 | 关联孩子的周／日课表、反馈、课时、订单与消息 | 切换孩子、创建订单、支付、帮助中心 |
| 系统管理员 | 集成健康、后台任务、outbox、审计、支持会话 | 运行沙盒 worker、申请限时且受审计的技术支持 |

跨模块能力不是单独的“异常页”或“AI 页”：

- 老师／教室／学生使用半开区间排课冲突检查，应用层预检并由数据库 trigger 防并发穿透。
- 正式课完成点名后，出勤、迟到和缺席按机构策略扣一课时；获批豁免不扣；试听不消费正式课包。
- 完成课次同时累计一条老师薪资；费率按老师、课次类型和生效日期选择。
- 支付回调、课时账本、支付流水、审计和已支付薪资有唯一约束或不可变保护。
- AI 只产出可编辑文本草稿；脱敏、结构校验或 provider 失败均不会影响点名和计费。
- FAQ 助手只允许选择机构批准的固定答案；个人排课、退款、支付争议、医疗／安全等问题直接创建 owner 人工跟进任务。

## 技术栈

- React 19、TypeScript、Vinext／Next Route Handlers、Tailwind、shadcn/ui。
- Cloudflare D1／SQLite、Drizzle schema 与顺序迁移。
- 本地使用 PBKDF2 密码凭据与服务端会话；托管环境可继续使用 ChatGPT Identity；内部 `AccountRoleAssignment` 做授权。
- 可选 Gemini 原生 structured output；无 key 时使用确定性本地 fallback。
- Payment 使用可执行 sandbox；Bank、Email、SMS、WeChat 当前只有配置／消息／outbox 边界，没有伪装成已接通的渠道。

## 本地运行

要求 Node.js 22.13+。支持 Apple Silicon 和 Intel Mac，不需要 Docker、Cloudflare 登录或 Gemini key。

```bash
git clone https://github.com/MadMax3366/Austin_homework.git
cd Austin_homework
node --version
npm run install:ci
npm run demo:setup
npm run demo
```

打开 [http://localhost:5173](http://localhost:5173) 并使用以下独立账户登录：

| 工作台 | 邮箱 | 密码 |
|---|---|---|
| 教师 | `teacher@austin.edu` | `Teacher#2026` |
| 运营 | `operations@austin.edu` | `Operations#2026` |
| 主管 | `manager@austin.edu` | `Manager#2026` |
| 学生 | `student@austin.edu` | `Student#2026` |
| 家长 | `guardian@austin.edu` | `Guardian#2026` |
| 系统管理 | `system@austin.edu` | `System#2026` |

`demo:setup` 会依次构建、把所有未应用迁移写入同一个 `.wrangler/state` 本地 D1，并执行可重复 Seed。基线包含 1,000 名学生、10 位运营、20 位老师和 60 个每周固定班；课时余额分布在 0–34，活跃学生分配到班级与老师，77 名学生同时参加两个不冲突的班，并包含支付、续费与退款数据。

如果之前已经演示并修改了数据，需要恢复到初始场景，请先停止开发服务器，再运行：

```bash
npm run demo:reset
```

旧数据库不会删除，而会移动到带时间戳的 `.wrangler/state-backup-*` 目录。

如需分步执行：

```bash
npm run build
npm run db:migrate:local
npm run db:seed
npm run dev
```

可选真实 LLM：复制 `.env.example` 为 `.dev.vars`，填写仅供服务端使用的 `GEMINI_API_KEY`；默认模型是 `gemini-3.1-flash-lite`，可用 `GEMINI_MODEL` 覆盖。`.dev.vars` 已被 Git 忽略，真实密钥不得提交。没有 key 时，教师反馈使用本地 fallback，FAQ 使用批准知识确定性匹配或转人工。

```bash
cp .env.example .dev.vars
```

`npm start` 直接运行构建后的 Worker，同样支持上述账户登录。所有姓名、联系方式、订单和交易均为合成数据；正常应用路由不会自动造数据。

## API

| Method | Route | 说明 |
|---|---|---|
| GET | `/api/account` | 当前组织账号及有效角色 |
| GET | `/api/platform/overview?role=...` | 运营、主管、学生、家长、系统工作台；运营学生目录支持 `studentQuery` 与 `studentPage` 服务端搜索分页 |
| POST | `/api/platform/commands?role=...` | 15 类受控业务命令；命令内部做对象授权和状态机 |
| POST | `/api/faq/triage?role=student|guardian` | 受批准知识约束的 FAQ 分类；无法安全回答则原子转人工 |
| GET | `/api/workspace?sessionId=...` | 老师自己的今日课次、名单、余额与薪资摘要 |
| POST | `/api/sessions/:sessionId/complete` | 老师完成课次；要求 `Idempotency-Key` |
| POST | `/api/feedback/draft` | 当前任课老师生成可编辑反馈草稿 |
| GET/POST | `/api/admin/billing-exceptions...` | 课时异常查询与审计式处理 |

所有写请求限制真实 UTF-8 body 大小、校验 JSON、拒绝 cross-site 浏览器请求，并返回稳定错误码和 `X-Request-Id`。高风险流程通过 provider event、唯一业务键、状态机和事务保证单一赢家。

## 验证

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run check:license
```

自动化测试覆盖：

- 0000–0012 clean migration，以及 0006 → 最新版本的数据保留升级；
- 角色主体约束、枚举／JSON CHECK、半开区间排课、班级容量；
- 冻结名单、出勤 claim、余额不为负、账本和审计不可变；
- 多试听生、唯一待处理试听、支付／退款／薪资／支持会话状态机；
- 实际请求字节限制、same-origin 防护和错误响应契约。

本地生产构建还完成过六角色 overview smoke、支付回调重放、退款、薪资、outbox、越权 403、冲突 409 和 break-glass 自批 409 验证。

## 边界与诚实声明

- 题面描述的是单一教育机构，旧核心表按单机构运行；新账号、订单、任务、集成和系统表已带 `organization_id`。若产品转为真正 SaaS，必须给所有旧核心实体补租户外键，并做双租户隔离测试。
- 支付是可执行 sandbox；银行、邮件、短信和微信只实现了配置与 outbox 数据边界，尚无发送／代发代码。上线前还需要 provider webhook 签名、对账、密钥管理、重试租约和 dead-letter。
- 当前退款策略刻意只支持“未使用课包的全额退款”；部分退款、手续费和消费归因需要业务规则确认。
- 完整生产发布仍需要远程 D1 并发压测、备份恢复演练、监控告警和真实 IdP 生命周期管理。

## AI 工具披露

我使用 Codex 做需求拆解、架构对抗审查、schema／API／UI 草拟、迁移验证、破坏测试和文档整理。生成内容经过人工式审查并被多次推翻或收紧，例如拒绝可变余额、AI 控制业务、系统管理员永久业务超级权限、运行时自动 seed，以及仅靠前端隐藏菜单的“权限控制”。

## 许可

© 2026 **Junfeng Yan（GitHub：MadMax3366）**。保留所有权利。本仓库仅授权面试评估使用，不是开源软件。除 GitHub 平台条款明确允许的站内操作及第三方材料原有许可外，未经书面许可，不得复制、再分发、商业使用、产品集成、改编、提交衍生方案或用于 AI/ML 训练。详见 [LICENSE.md](./LICENSE.md)；第三方材料见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
