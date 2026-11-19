> **Physical Intelligence：跨机器人预训练 → 新任务适配 → 从真实机器人自身经验继续学习。**

## 关键模型演进

| 模型 | 主要研究方向 | 从数据角度理解 |
|---|---|---|
| π0 | 大规模多机器人、多任务 VLA | 尝试学统一的通用操作策略 |
| π0.5 | 开放环境泛化 | 混合机器人数据、视觉语言与语义任务信息 |
| π*0.6 / RECAP | Experience-based policy improvement | 示范、自主 rollout、人类纠正、反馈/奖励 |
| π0.7 | 可控行为与丰富条件信息 | 结合 quality、speed、control modality、subgoal 等条件 |

这些属于**不同模型/不同研究阶段**，不能合并成一份固定的公司训练配方。

## 为什么 Multi-Robot 数据重要？

不同机器人形态、运动范围、夹爪与任务数据并不完全相同。研究者希望从异构数据中学习共性，再利用目标平台特定数据进行调整。

```text
Robot A Data ──┐
Robot B Data ──┼── Shared Policy / Representation
Robot C Data ──┘                 ↓
                        Target-Robot Adaptation
```

## 为什么 RECAP / 自主经验重要？

模仿学习主要覆盖人类专家行为；自主运行会产生专家示范不常出现的失效状态。通过 human correction 和奖励信息，策略可以逐步改善真实闭环表现。但要区分行动的**质量和结果**，不能把全部 rollout 当作专家示范。

## 为什么 π0.7 的质量条件很有意思？

如果训练数据混合了快而准确的操作与慢/失败操作，训练时引入质量、速度或控制条件，可以告诉模型希望输出何种行为，而不是默认每段轨迹同样值得模仿。

## 资料与局限

参考：[π0 原始论文](https://www.physicalintelligence.company/download/pi0.pdf)、[π0 官方介绍](https://www.physicalintelligence.company/blog/pi0)。完整的内部数据比例并未公开；请勿把新闻中不同版本的数量拼成一组精确 recipe。

关联：[Behavior Cloning / RL](?page=learning-paradigms)、[Data Flywheel](?page=data-flywheel)。
