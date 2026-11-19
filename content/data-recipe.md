> **Data Recipe = 数据来源 + 数据处理 + 训练阶段 + 采样策略 + 学习目标。** 它不是把几种数据的小时数列出来就结束。

## 为什么需要 Recipe？

不同数据拥有的监督信号不同：机器人遥操有目标平台 action；人类视频一般只有视觉变化；仿真可能有精确状态和奖励；自主 rollout 可以有失败、成功和干预。

要让同一个模型有效利用这些数据，需要决定 **什么时候用、以什么比例用、为了学到什么能力而用**。

## 一个可理解的三阶段结构

| 阶段 | 常见数据 | 学习目标 |
|---|---|---|
| Broad Pretraining | Web Video、Ego Video、多机器人数据、Simulation | 视觉、语义、任务/物理先验、通用动作表示 |
| Post-training / Fine-tuning | Target Robot Teleoperation、Task Demonstrations | 对齐目标 robot embodiment 和关键任务 |
| Experience-based Improvement | Autonomous Rollouts、Failure、Correction、Reward | 提高真实任务成功率、速度和鲁棒性 |

**注意**：这是一种教学性整合，不是行业唯一架构。具体模型可能联合训练不同来源、交替训练或使用更复杂的多目标损失。

## 数据总量不是 Training Sampling Ratio

假设平台有：

```text
100,000 h Human Video
  5,000 h Robot Teleoperation
```

不能得出“训练中一定按 20:1 使用”这个结论。Training Mixer 可能大量 oversample 高价值机器人 action，给不同数据设 loss weight，或者先用人类视频做 world pretraining，再单独 fine-tune robot policy。

正确的问题是：

- 各数据池的**总量、去重后的有效量**分别是多少？
- 每个 training step 的**抽样比例、训练 token 数、loss 权重**是多少？
- 各数据对应什么 **objective**？视频预测、动作预测、奖励估计，还是多目标联合训练？
- 各训练阶段切换时，什么参数被冻结、什么参数被更新？
- 训练结果在同一套 held-out tasks 上有无明确 **ablation** 支持？

## Data Recipe 不只是“训练阶段”

一份完整的研究记录还应描述：

1. **Data provenance**：来源、许可、采集设备、版本与可追溯性。
2. **Filtering**：质量筛选、去重、失败与成功的处理方式。
3. **Normalization**：坐标系、单位、动作表示、时间间隔统一。
4. **Mixture**：数据权重、任务分布、不同机器人权重。
5. **Objective**：BC、Flow Matching、Video Prediction、RL 等。
6. **Evaluation**：任务范围、环境变化、硬件差异、真实部署表现。

## 跨公司的公开数字如何读？

例如 [NVIDIA GR00T 2](?page=company-nvidia) 公布了人类视频、UMI 与机器人遥操各自的小时数；[Toyota LBM](?page=company-toyota) 也披露了较精确的数据池。但并不是所有公司都公开了完整 batch 混合权重、训练 token 分布与去重策略。

因此，不应从三个数据量数字直接推算模型每一步梯度中人类视频和机器人数据的“贡献比例”。

## 一个成熟的判断框架

**数据对某项能力的边际贡献**，比“总数据量”更有价值。可通过 controlled ablation 来观察：删掉人类视频是否明显降低新环境泛化？删掉 failure rollouts 是否让恢复能力下降？增加某个机器人平台的数据是否帮助其他平台？

下一步探索：[模型如何从示范学习动作](?page=training-loop) / [行业 Data Recipe](?page=industry-landscape) / [如何评价数据质量](?page=quality-evaluation)。
