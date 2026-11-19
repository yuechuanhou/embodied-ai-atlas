> **行业 Data Recipe 比较必须以具体模型版本为单位。** 同一家公司的总数据资产，不等于某一次训练实际用了全部数据；不同报告的小时数也可能有交叠。

## 八家公司训练路线对照

| 公司 / 代表模型 | 突出数据来源 | 训练特色 | 尚需谨慎的地方 |
|---|---|---|---|
| [NVIDIA · GR00T 2](?page=company-nvidia) | Human Ego + UMI + Robot Teleop | World-Action 联合学习 | 总小时数不等于 batch 比例 |
| [Physical Intelligence · π 系列](?page=company-pi) | 多机器人 + 自主经验 + 纠正 | 跨形态泛化与后训练 | 不同 π 版本不能混为一次训练 |
| [Figure · Helix / Index](?page=company-figure) | 人类行为视频、motion、robot | Humanoid transfer + whole-body | 平台上传量不是训练使用量 |
| [1X · World Model](?page=company-1x) | Human video + robot video/action | 视频预测 + IDM | 数据量分属不同阶段 |
| [Google · Gemini Robotics](?page=company-google) | VLM + multi-robot + simulation | 多机器人迁移 + AI 辅助仿真 | 未公开完整训练配比 |
| [Toyota TRI · LBM](?page=company-toyota) | Robot teleop + UMI + Simulation + OXE | 多任务 diffusion policy | 任务集与其他公司不可直接对照 |
| [AgiBot · GE-Act 2.0](?page=company-agibot) | Video + action trajectories + failure | 世界/动作分阶段预训练 | 数据池存在交叠 |
| [Skild AI · S1](?page=company-skild) | Teleop + UMI + Ego + Sim | 视频示范 In-Context Learning | 未公开完整 mixer 权重 |

## 三条值得关注的行业线索

### 1. 真实机器人示范仍然不可轻易替代

它们与目标执行器、物理接触和动作控制最接近，但受硬件、操作员和时间限制。很多公司在扩大机器人示范之外，也在寻找低成本数据来源。

### 2. 利用无原生机器人动作的人类视频

NVIDIA、Figure、1X 等公开研究表明，大规模人类视频可以帮助学习可迁移的任务/物理先验。但如何把视频映射为机器人可执行 action，仍然需要模型设计、适配数据或其他监督。

### 3. 从纯示范走向真实机器人试错

Physical Intelligence 等公司公开的自主 rollout、纠正、反馈路线说明：**机器人自己执行产生的状态分布**对鲁棒性和恢复能力很重要。

## 读公司报告的五个核对问题

1. 这是公司的**全部数据资产**，还是某个具体模型的**训练池**？
2. “hours” 是 raw collected hours、filtered hours、还是 sampled training hours？
3. 数据是 **pretraining / alignment / fine-tuning / RL** 哪个阶段？
4. 是否公开训练 sample ratio、loss/objective 和关键 ablation？
5. 报告的是 offline metric、simulation benchmark 还是真实机器人任务成功率？

## 研究快照说明

本专题资料核对截至 **2026-11-19**。公司公开博客、论文及自报实验随时间更新。下列个案均尽量附官方原始链接；没有披露的配方细节标注为未知，而不以行业习惯替代事实。
