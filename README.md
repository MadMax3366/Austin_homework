# Austin Education · Student Operations System

> [!IMPORTANT]
> **PROPRIETARY EVALUATION ARTIFACT — NOT OPEN SOURCE.** Artifact ID `AUS-HOMEWORK-MADMAX3366-2026-09`. Review and execution are governed by [LICENSE.md](./LICENSE.md); third-party carve-outs are listed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

这是一个可运行的模块化全栈作业：同一账号可切换教师、运营、主管、学生、家长和系统管理员职责，服务端会在每次读取和写入时重新校验角色与对象范围。

核心业务链路已经接通：

> 咨询 → 试听排课 → 老师点名与反馈 → 试听结论 → 转正式班与首期订单 → 支付入课时 → 正常上课扣课时 → 续费／退款 → 老师计薪 → 消息 outbox 与审计。

相关文档：

- [DESIGN.md](./DESIGN.md)：按题面七项要求整理的 Part A 设计文档。
- [ARCHITECTURE.md](./ARCHITECTURE.md)：五层架构、权限、模块、生命周期与数据设计。
- [DEMO.md](./DEMO.md)：面试演示脚本和主动破坏测试。
- [TESTING.md](./TESTING.md)：自动化覆盖与对抗测试矩阵。

## 已实现内容

| 工作台 | 可见内容 | 可执行操作 |
|---|---|---|
| 教师 | 今日课表、冻结名单、新生、余额、个人薪资 | 点名、课堂笔记、AI 家长反馈、完成课次 |
| 运营 | 试听完成待跟进、低课时学生、咨询、全局课表、排课资源 | 建咨询、排试听、记录结论、转报名、完成跟进、代建续费订单 |
| 主管 | 排课冲突、退款、订单、课时异常、薪资周期、支持申请 | 退款审批、薪资审批／支付、限时支持审批 |
| 学生 | 自己的课表、出勤反馈、课时、订单、消息 | 创建续费订单、沙盒支付、FAQ 问答／转人工 |
| 家长 | 多个关联学生及其课表、反馈、课时、消息 | 切换孩子、创建订单、沙盒支付、FAQ 问答／转人工 |
| 系统管理员 | 集成健康、后台任务、outbox、审计、支持会话 | 运行沙盒 worker、申请限时且受审计的技术支持 |

跨模块能力不是单独的“异常页”或“AI 页”：

- 老师／教室／学生使用半开区间排课冲突检查，应用层预检并由数据库 trigger 防并发穿透。
- 正式学生 `Present/Late` 扣一课时；试听参与者不扣课时；余额不足保留真实出勤并进入异常队列。
- 完成课次同时累计一条老师薪资；费率按老师、课次类型和生效日期选择。
- 支付回调、课时账本、支付流水、审计和已支付薪资有唯一约束或不可变保护。
- AI 只产出可编辑文本草稿；脱敏、结构校验或 provider 失败均不会影响点名和计费。
- FAQ 助手只允许选择机构批准的固定答案；个人排课、退款、支付争议、医疗／安全等问题直接创建 owner 人工跟进任务。

## 技术栈

- React 19、TypeScript、Vinext／Next Route Handlers、Tailwind、shadcn/ui。
- Cloudflare D1／SQLite、Drizzle schema 与顺序迁移。
- ChatGPT Identity 作为身份提供方；内部 `AccountRoleAssignment` 做授权。
- 可选 OpenAI structured output；无 key 时使用确定性本地 fallback。
- Payment 使用可执行 sandbox；Bank、Email、SMS、WeChat 当前只有配置／消息／outbox 边界，没有伪装成已接通的渠道。

## 本地运行

要求 Node.js 22.13+。

```bash
npm run install:ci
npm run build
```

在一个新的本地 D1 上顺序应用迁移：

```bash
for migration in drizzle/*.sql; do
  node --import ./scripts/sites-env.mjs \
    ./node_modules/wrangler/bin/wrangler.js d1 execute DB \
    --local --config dist/server/wrangler.json \
    --persist-to .wrangler/state --file "$migration"
done
```

然后加载可重复执行的合成数据并启动：

```bash
npm run db:seed
npm start
```

打开 [http://127.0.0.1:8787](http://127.0.0.1:8787)。本地身份为 `seedy@sites.test`，角色选择页可进入六种职责。所有姓名、联系方式、订单和交易均为合成数据；正常应用路由不会自动造数据。

## API

| Method | Route | 说明 |
|---|---|---|
| GET | `/api/account` | 当前组织账号及有效角色 |
| GET | `/api/platform/overview?role=...` | 运营、主管、学生、家长、系统工作台；服务端角色校验 |
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

- 0000–0011 clean migration，以及 0006 → 最新版本的数据保留升级；
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

## 许可、来源与防误用

本仓库公开可见是为了面试评估，不代表开源。原创建内容采用 [Austin Evaluation-Only License 1.0](./LICENSE.md)；GitHub 平台条款允许的站内查看／fork 权利不受该文件撤回，但公开可见不会额外授予商业使用、产品集成、再分发、衍生提交或 AI/ML 训练权限。

- 权利与评估期限：[LICENSE.md](./LICENSE.md)
- 醒目权利声明：[NOTICE.md](./NOTICE.md)
- 第三方 MIT 边界：[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
- 作者与时间证据：[PROVENANCE.md](./PROVENANCE.md)
- 贡献政策：[CONTRIBUTING.md](./CONTRIBUTING.md)
- 具名评估授权邮件模板：[EVALUATOR_AUTHORIZATION_TEMPLATE.md](./EVALUATOR_AUTHORIZATION_TEMPLATE.md)
- GitHub ruleset、签名 tag 和评估后收口清单：[REPOSITORY_HARDENING.md](./REPOSITORY_HARDENING.md)

公开仓库无法技术上阻止复制。更强的控制方式是：向具名面试官发出有到期日的书面评估授权，提交后创建受保护的签名 tag／Release，并在评估结束后将仓库转为 private。已经存在的 fork 或本地副本不能靠可见性变更自动收回。
