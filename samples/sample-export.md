# S-1 术语库与批注

导出时间：2026-10-19
术语 66 条 · 批注 0 条

## 术语库

### 4

**409A valuation** — 409A 估值
> 美国税法 409A 条要求的独立第三方估值报告，用于确定期权的公允市场价值（行权价下限）。

商业含义：行权价定低了会触发税务处罚。S-1 里不会直接写，但在税务章节和期权授予讨论中隐含。

关联：option, RSU

### A

**acceleration** — 加速归属
> 在特定事件（控制权变更、被解雇）发生时，未归属股权提前全部或部分归属。

商业含义：single trigger（只要控制权变更就加速）vs double trigger（变更且被解雇才加速）。后者对公司更有利。

关联：vesting schedule, change of control

**ADR** — 美国存托凭证
> American Depositary Receipt，ADS 的凭证形式，二者日常混用。

商业含义：严格说 ADS 是股份本身，ADR 是证明文件。实务中常互换。

关联：ADS

**ADS** — 美国存托股份
> American Depositary Share，外国公司股票由存托银行托管后，在美国发行的代表凭证，按固定比例对应 underlying shares。

商业含义：中概股的核心交易工具。要看 ADS ratio（一股 ADS 代表几股普通股），以及存托银行是谁、费用条款如何。

关联：ADR, depositary bank

**anti-dilution** — 反稀释条款
> 后续以更低价格融资时，早期优先股的转换价下调，以补偿其被稀释的损失。

商业含义：分两种：full ratchet（完全棘轮，直接降到新低价，对创始团队极狠）和 weighted average（加权平均，温和得多）。看条款时先分清是哪一种。

关联：conversion price, full ratchet, weighted average

**as-converted basis** — 按转换基准
> 把所有可转换证券视为已转换为普通股后计算的持股比例。

商业含义：看"占比"时最容易踩的坑：同样的股份数，as-converted 和 as-issued 算出来差很多。S-1 里 beneficial ownership 表格通常用 as-converted。

关联：fully diluted, beneficial ownership

### B

**beneficial ownership** — 受益所有权
> 实际享有经济利益的所有权，包括通过信托、代持、关联实体间接持有的股份。

商业含义：SEC 按此口径披露主要股东（通常 5% 以上）。注意 60 天内可行权的期权也要计入。

关联：as-converted basis, related party transaction

**book-building** — 簿记建档
> 承销商向机构投资者征集认购意向和报价，据此确定最终发行价和股份分配的过程。

商业含义：价格区间的形成机制。簿记超额认购倍数（oversubscription）是判断需求热度的重要信号。

关联：road show, offering price

### C

**cap table** — 股本结构表
> 列明各股东持股数量、期权、可转债及稀释后比例的明细表。

商业含义：读 S-1 的 Capitalization 章节就是看这张表。重点看创始人实际控制力、员工期权池大小、投资人稀释程度。

关联：fully diluted, ESOP

**change of control** — 控制权变更
> 通常定义为某主体取得一定比例（如 50%）以上投票权，或董事会多数席位更替。

商业含义：触发加速归属、债务提前到期等一系列条款的开关。定义宽窄直接影响交易成本。

关联：acceleration, drag-along right

**clawback** — 追回条款
> 公司在特定情形（财务重述、欺诈、违反竞业）下，有权追回已支付的薪酬或股权。

商业含义：SEC 和交易所对上市公司有强制追回要求（Dodd-Frank 302 条）。看追回范围是否只覆盖高管。

关联：indemnification

**cliff** — 悬崖期
> 归属期的初始门槛，常见 1 年：工作满一年后 25% 一次性归属，之后按月归属。

商业含义：未满 cliff 离职，一股都拿不到。

关联：vesting schedule

**comfort letter** — 安慰函
> 审计师应承销商要求，就招股书中的财务数据出具的有限保证函。

商业含义：不是审计意见，只是"我们没发现不一致"。承销商用来自证已尽合理调查。

关联：Section 11, due diligence

**Contribution Margin** — 边际贡献 / 贡献毛益
> 每 1 元销售收入在扣除直接变动成本后，能为公司留下多少钱去覆盖固定成本、支持增长并创造利润。

商业含义：影响定价、增量业务是否赚钱有关

出处：Palantir S-1.pdf · P.102

**convertible note** — 可转换票据
> 带利息和到期日的债权，可在下一轮融资时按约定折扣转为股权。

商业含义：与 SAFE 的区别：有到期日、有利息、法律上是债，公司破产时清偿顺序优于股权。

关联：SAFE

**cornerstone investor** — 基石投资人
> 在 IPO 定价前承诺认购一定金额、并接受 6 个月左右锁定的机构投资者。

商业含义：港股和 A 股常见，美股较少。作用是给发行背书、稳定定价。要区分"真基石"（独立第三方）和"关系户"。

关联：lock-up period

### D

**D&O insurance** — 董事高管责任险
> 覆盖董事、高管因履职被诉时的抗辩费用和赔偿责任的保险。

商业含义：和 indemnification 一起构成高管保护体系。IPO 前必须买。

关联：indemnification

**depositary bank** — 存托银行
> 负责发行、登记、管理 ADS，并代持底层股票的银行。

商业含义：常见花旗、摩根大通、纽约梅隆。存托协议里的费用条款（存取费、分红费）会持续侵蚀持有人收益。

关联：ADS, custodian

**directed share program** — 定向配售计划
> 预留一部分发行股份，定向分配给员工、客户、供应商、关联方等特定人群。

商业含义：本质是利益输送的合法通道，也是承销商维系关系的手段。要看分配比例和是否折价。

关联：underwriter, related party transaction

**drag-along right** — 拖售权
> 多数股东决定出售公司时，可强制少数股东以同等价格和条件一同出售股份。

商业含义：保护买方能买到 100% 股权，避免少数股东卡住交易。对 minority 是双刃剑：好处是能搭车退出，坏处是没有否决权。

关联：tag-along right

**dual-class structure** — 双层股权结构
> 设置 A/B 两类普通股，B 类每股拥有多倍投票权（常见 10 票、20 票），通常由创始人持有。

商业含义：重点看两件事：IPO 后创始人合计投票权比例，以及有没有 sunset clause（日落条款）约定何时自动回归一股一票。没有日落的双层结构，外部股东永远无法通过投票改变控制权。

关联：super-voting shares, WVR, sunset clause

### E

**earn-out** — 或有对价
> 并购交易中，买方在交割时先付一部分，剩余部分按标的未来业绩达成情况追加支付。

商业含义：本质是估值分歧的缓冲机制。看业绩指标怎么定义——EBITDA 口径的调整项往往是争议焦点。

关联：escrow, material adverse effect

**emerging growth company** — 新兴成长公司
> JOBS 法案定义的年收入低于约 12.35 亿美元的公司，可享受简化披露、豁免审计师内控意见等减负待遇。

商业含义：很多科技公司 IPO 时都勾选这个身份。意味着你看到的信息比成熟公司少——这是读 S-1 时要打折扣的地方。

关联：JOBS Act, foreign private issuer

**escrow** — 第三方托管
> 资金或股份交由独立第三方保管，待约定条件满足后释放。

商业含义：并购中用于保证金、earn-out；IPO 中用于员工股份的临时保管。

关联：earn-out

### F

**F-1** — 外国私人发行人注册声明
> 非美国公司在美国 IPO 时使用的注册表格，披露要求略宽松。

商业含义：中概股基本走 F-1。注意与 20-F（年报）配套。

关联：S-1, foreign private issuer, 20-F

**foreign private issuer** — 外国私人发行人
> 满足一定条件（多数股份由非美国人持有等）的非美国公司，可享受较宽松的披露与报告义务。

商业含义：本质是监管套利空间：可以豁免季度报告、代理声明规则等。

关联：F-1, 20-F

**free float** — 自由流通量
> 不含锁定股份、可在市场上自由交易的股本比例。

商业含义：free float 太低会导致流动性差、指数纳入困难、股价易被操纵。

关联：lock-up period

**full ratchet** — 完全棘轮
> 反稀释的最强形式：新一轮价格多低，早期投资人的转换价就直接降到多低。

商业含义：对创始人杀伤极大，硅谷实践中已较少见。看到这个词要警觉。

关联：anti-dilution, weighted average

**fully diluted** — 完全稀释
> 计入全部已发行股份、期权、认股权证、可转债后的股本总数。

商业含义：分母选错，估值就差一截。谈估值时必须问清楚是 pre-money 完全稀释还是仅已发行股本。

关联：as-converted basis, overhang

### G

**greenshoe option** — 超额配售选择权（绿鞋机制）
> 承销商可在发行后 30 天内，按发行价额外购买不超过基础发行量 15% 的股份。

商业含义：本质是给承销商的一份看涨期权：破发时买入托价，上涨时行权多募 15% 的钱。名字来自 1963 年首次使用该机制的 Green Shoe 公司。

关联：over-allotment, stabilization, underwriter

**gross proceeds** — 募资总额
> 发行股数 × 发行价，未扣除承销费等发行费用。

商业含义：媒体常报这个数字，但公司实际拿到的是 net proceeds，差额可能高达 7%。

关联：net proceeds, underwriter's discount

### I

**indemnification** — 赔偿/免责条款
> 公司承诺为董事、高管因履职引发的诉讼承担费用和赔偿。

商业含义：对独董尤其重要——没有充分 indemnification 和 D&O 保险，很难请到合格的独立董事。

关联：D&O insurance, clawback

### J

**JOBS Act** — 创业企业融资法案
> 2012 年美国立法，放宽小型公司的融资和披露要求，创设 EGC 身份。

商业含义：EGC 制度是理解很多美股 IPO 披露"为什么这么简略"的关键。

关联：emerging growth company

### L

**liquidation preference** — 优先清算权
> 优先股股东在公司清算或被并购时，优先于普通股按约定倍数（常见 1x）取回投资额。

商业含义：决定"退出时谁先拿钱"。要看三件事：几倍、是否 participating（拿完本金还参与剩余分配）、是否累计分红。IPO 时优先股通常自动转为普通股，所以这个条款主要影响 IPO 前的并购退出。

关联：participating preferred, as-converted basis

**lock-up period** — 锁定期
> IPO 后现有股东（创始人、员工、pre-IPO 投资人）在一定期限内不得出售股份，通常 180 天。

商业含义：直接决定上市后前半年的实际可流通盘。锁定期越长、锁定比例越高，解禁日的抛压越大——这是交易层面的重要时点。

关联：free float, overhang

### M

**material adverse effect** — 重大不利影响
> MAE，合同中的触发条款：一旦发生，另一方可解除合同或拒绝交割。

商业含义：并购和承销协议里的核心条款。MAE 的定义越窄，卖方越安全；越宽，买方越有退出空间。

关联：MAC/MAE, termination

**MD&A** — 管理层讨论与分析
> Management's Discussion and Analysis，管理层解释财务数据变动原因及流动性状况的章节。

商业含义：S-1 里信息密度最高的一章。要带着"为什么这个数字变了"去读，警惕只描述现象不解释原因的部分。

关联：Risk Factors, liquidity

### N

**net proceeds** — 募资净额
> 募资总额扣除承销折扣和发行费用后，公司实际到账的金额。

商业含义：看 use of proceeds 时要以净额为准。

关联：gross proceeds

### O

**over-allotment** — 超额配售
> 承销商在发行时卖出超过原定数量的股份，形成空头头寸，再由绿鞋机制补回。

商业含义：和 greenshoe 是同一套动作的两面：先超卖，再决定是行权买入还是市场买回。

关联：greenshoe option

**overhang** — 潜在稀释压力
> 尚未行权的期权、未解禁股份占现有股本的比例。

商业含义：overhang 越高，未来稀释越重，现有股东被摊薄的压力越大。

关联：lock-up period, fully diluted

### P

**pre-money valuation** — 融资前估值
> 投资款进入之前的公司估值。

商业含义：post-money = pre-money + 本轮融资额。谈条款时最容易在"用哪个口径"上产生分歧。

关联：post-money valuation, fully diluted

### Q

**quiet period** — 静默期
> IPO 前及上市后一段时间内，公司及承销商不得发表可能影响发行的公开言论。

商业含义：违反可能构成 gun-jumping，导致发行延期。

关联：road show

### R

**red herring prospectus** — 红鲱鱼招股书（初步招股书）
> 尚未确定最终发行价的初步招股说明书，封面有红色警示字样。

商业含义：你做批注时读的 S-1 通常是这个版本。最终版（final prospectus）价格和股数才确定。

关联：prospectus, S-1

**Regulation S** — S 条例
> 美国证券法下的境外发行豁免条款，允许向美国境外的非美国人发行证券而无需注册。

商业含义：常与 Rule 144A 搭配，构成"双轨发行"。

关联：Rule 144A

**related party transaction** — 关联交易
> 公司与董事、高管、主要股东及其关联方之间的交易。

商业含义：S-1 有专章披露。重点看定价是否公允、有无独立董事审批程序、金额占收入比例。

关联：beneficial ownership, directed share program

**Risk Factors** — 风险因素
> 法定披露章节，列举可能影响公司的各类风险，通常是招股书最长的一章。

商业含义：法律上是免责工具，措辞高度模板化。真正值得读的是"行业特有风险"和"与我们的商业模式相关"的那几条，通用风险可略过。

关联：MD&A

**road show** — 路演
> 管理层在发行前向机构投资者做的一系列推介演示。

商业含义：路演反馈会影响最终定价区间是否上调或下调。

关联：book-building

**RSU** — 限制性股票单位
> Restricted Stock Unit，满足归属条件后交付股票，通常无行权价（不像期权要花钱买）。

商业含义：科技公司常用。税务上归属时按市价计入普通收入，员工可能"有税无现金"，公司常用 sell-to-cover 解决。

关联：option, vesting schedule

**Rule 144A** — 144A 规则
> 允许向合格机构买家（QIB）转售受限证券而无需注册的豁免条款。

商业含义：私募债和境外发行的常用通道。

关联：Regulation S

### S

**S-1** — 注册声明（美国本土发行人）
> 美国 1933 年证券法要求本土公司 IPO 时提交的注册声明表格。

商业含义：外国发行人用 F-1。S-1 分两部分：招股书（给投资者看）+ 第二部分（补充信息，不含在招股书内）。

关联：F-1, prospectus

**SAFE** — 未来股权简单协议
> Simple Agreement for Future Equity，投资人现在给钱，未来按约定条件（通常带估值上限或折扣）转为股权。

商业含义：严格说不是债也不是股，法律性质模糊。Y Combinator 推广。多个 SAFE 叠加时，真实稀释很难算清——这是尽调重点。

关联：convertible note, cap table

**Section 11** — 证券法第 11 条责任
> 注册声明存在重大虚假陈述或遗漏时，发行人、承销商、审计师、董事等对投资者承担的民事责任。

商业含义：承销商的尽调抗辩（due diligence defense）就是为了对抗这一条。这是 S-1 里所有"风险因素"措辞的法律根源。

关联：due diligence, comfort letter

**shelf registration** — 储架注册
> 一次注册、分批发行的机制，注册后一定期限内可随时发行证券。

商业含义：大型公司常用，提高融资灵活性。S-3 表格是典型载体。

关联：S-1, S-3

**stabilization** — 稳定价格操作
> 承销商在上市后一段时间内买入股份以支撑股价的行为，受 SEC 规则约束。

商业含义：和 greenshoe 配套使用。属于合法操纵，但必须披露。

关联：greenshoe option, over-allotment

**stock-based compensation** — 股权激励报酬 / 股份支付 / 股权激励费用
> 就是公司用股票或期权代替现金支付报酬

商业含义：会计上是非现金费用，经济上会稀释股东，是科技公司和初创公司很常见的一种激励方式

出处：Palantir S-1.pdf · P.102

**sunset clause** — 日落条款
> 约定超级投票权在特定条件（创始人离职、持股低于某比例、固定年限）下自动失效的条款。

商业含义：判断双层股权结构是否"有牙"的关键。硬日落 vs 软日落的差别，决定了控制权能锁多久。

关联：dual-class structure

### T

**tag-along right** — 随售权
> 大股东出售控制权时，少数股东有权按比例跟随卖出。

商业含义：和 drag-along 是一对：一个是"我能拖你走"，一个是"我能跟着走"。

关联：drag-along right

**transfer agent** — 过户代理
> 维护股东名册、处理股权转让和登记的专业机构。

商业含义：上市后所有股份登记都走它。常见 Computershare、Equiniti。

关联：registrar

### U

**underwriter's discount** — 承销折扣
> 承销商从发行价中抽取的佣金，通常为募资总额的 5%–7%。

商业含义：是发行成本的主要部分。折扣高低反映承销商的议价能力和发行难度。

关联：gross proceeds, underwriting

**use of proceeds** — 募集资金用途
> S-1 法定章节，说明本次发行募资的具体投向。

商业含义：读这一章能看出管理层的真实优先级。如果大部分写"general corporate purposes"，说明要么没想清楚，要么不便明说。

关联：gross proceeds, net proceeds

### V

**vesting schedule** — 归属时间表
> 股权或期权分期成熟的时间安排，常见 4 年按 1/4 逐年归属。

商业含义：创始人 vesting 是否因 IPO 加速（single/double trigger）是重要条款，直接关系到上市后管理层会不会套现走人。

关联：cliff, RSU, acceleration

**VIE** — 可变利益实体 / 协议控制架构
> 境外上市主体不直接持股，而是通过一系列协议控制境内持牌运营实体，以规避外资准入限制。

商业含义：中国发行人特有。核心风险是协议的可执行性从未被中国法院正面确认，且一旦政策收紧，整个架构可能瞬间失效——这不是财务风险，是法律风险。

关联：WFOE, variable interest entity, contractual arrangements

### W

**weighted average** — 加权平均（反稀释）
> 按新股发行规模和价格加权计算调整后的转换价，稀释影响被摊薄。

商业含义：比 full ratchet 温和得多，是市场主流做法。

关联：anti-dilution

**WFOE** — 外商独资企业
> Wholly Foreign-Owned Enterprise，境外主体在境内设立的全资子公司。

商业含义：VIE 架构里通常是 WFOE 与境内运营实体签协议，而不是直接持股。

关联：VIE

**working capital** — 营运资金
> 流动资产减流动负债，衡量短期经营周转能力。

商业含义：S-1 的 liquidity 讨论会给出营运资金缺口和预计何时转正。持续为负且依赖融资，是危险信号。

关联：liquidity, MD&A

**WVR** — 不同投票权
> Weighted Voting Rights，港交所对同股不同权的称法。

商业含义：美股用 dual-class，港股用 WVR，实质是一回事。

关联：dual-class structure

## 批注
