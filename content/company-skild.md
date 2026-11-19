> **Skild AI S1：多来源 Data Engine + 通过单个视频示范进行 In-Context Learning。**

## 四种数据来源的权衡

Skild 的公开文章讨论：

- Robot Teleoperation：接近硬件动作空间，成本和扩展性是挑战；
- UMI：比传统 robot teleop 更方便扩展，但存在 embodiment mapping；
- Egocentric Human Video：规模扩展更强，但缺乏目标机器人 action；
- Simulation：容易并行化，但要解决现实迁移。

这是一个非常适合理解 **Hardware Proximity × Diversity × Scalability** 三方 trade-off 的框架。

## S1 的 In-Context Learning

在其公开研究演示中，S1 可以接收一段任务演示视频作为上下文，让机器人尝试执行此前未见的任务，而不必每次通过 gradient fine-tuning 更新模型参数。

这与经典“给一个任务采集大量遥操数据，再逐任务微调”的流程不同。

## 与 Data Flywheel 的关系

如果单个视频能够指导新任务，任务上线与新行为数据采集的周期可能缩短。但这种能力仍要在环境变化、硬件条件和长时间执行中严格测试。

来源：[Skild AI — Introducing S1](https://www.skild.ai/blogs/s1)。公司并未公开完整 Data Mixer、采样权重和所有训练阶段的数据比例。

关联：[数据分类](?page=data-taxonomy) / [模型学习范式](?page=learning-paradigms)。
