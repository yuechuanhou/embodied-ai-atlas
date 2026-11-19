> **分类的关键**：采集环境、操作者和数据内容是三个不同维度。不要把“真实数据”“遥操数据”“视频数据”当成互斥选项。

## 先按三个维度分类

| 维度 | 可能的取值 | 回答的问题 |
|---|---|---|
| Environment 环境 | Real World / Simulation / Generated | 数据在哪里产生？ |
| Actor / Collection Method 产生方式 | Human / Teleoperator / Autonomous Robot | 谁在执行动作？ |
| Supervision / Modality 数据内容 | Video / Robot State / Action / Language / Reward | 具体记录了什么？ |

比如通过 VR 控制真实机器人完成抓取，得到的数据同时是 **Real-World + Teleoperation + Multimodal Action-Labeled**。

## 1. Robot Teleoperation Data — 真实机器人遥操

人类通过 leader-follower 机械臂、手柄、VR、动捕设备或其他接口，控制真实机器人执行任务。记录包括 camera frames、joint states、end-effector pose、gripper command、timestamps 和 task metadata。

**主要作用**：Behavior Cloning / Imitation Learning；直接提供目标平台可执行的 `(observation, action)` 配对。

**优点**：动作标签原生可用、物理真实性高、与目标 hardware 接近。**局限**：昂贵、操作员能力差异大、动作分布可能偏向成功轨迹且覆盖有限。

## 2. Autonomous Robot Rollout Data — 机器人自主运行

让当前 policy 在真实机器人上自行运行，采集完整 rollout、success/failure、干预和环境状态变化。

**主要作用**：定位真实失效模式、训练恢复策略、强化学习、离线强化学习、模型评估；它与遥操示范形成 complementary data。

**优点**：贴近模型真实部署分布，能产生模型自己“会犯的错误”。**局限**：早期 policy 可能大量失败，动作质量并非天然可靠；需要安全管理与可信奖励/反馈。

## 3. Human Demonstration / Egocentric Video — 人类视频

通过手机、头戴相机、第一人称摄像头或公开视频，记录人类如何做饭、整理、装配和操作物体。

**主要作用**：学习视觉语义、任务结构、物体交互、动作意图和物理变化；适合大规模预训练和 World Model。

**优点**：多样性大、采集可扩展、无需机器人硬件。**局限**：通常没有机器人原生 action labels；人类手和机器人执行器不同，存在 **Human-to-Robot Gap**。

## 4. UMI / Instrumented Human Data — 带动作测量的人类示范

UMI（Universal Manipulation Interface）典型地通过带视觉传感器的手持夹爪，让人执行操作并同时记录操作轨迹。动捕手套等方案也可记录人体动作。

**主要作用**：低于真实机器人遥操的硬件开销，获得更接近机器人 action space 的示范；适合跨形态迁移或目标平台微调。

**局限**：轨迹仍需重定向（retargeting）；不同夹爪、手指自由度、力反馈和接触动力学不可直接等价。

## 5. Simulation Data — 物理仿真

在 Isaac Sim、MuJoCo、Isaac Lab 等模拟环境里运行机器人、策略或人类遥操。可控制地形、光照、质量、摩擦、场景布局和物体分布，并输出精确模拟状态与动作。

**主要作用**：Domain Randomization、预训练、强化学习、稀有场景生成与回归验证。

**优点**：并行化好、边际采样成本低、失败更安全。**局限**：Sim-to-Real Gap，特别是摩擦、形变、接触、传感器噪声和执行延迟。

## 6. Generative Synthetic Data — 生成式合成数据

利用视频生成模型、轨迹生成方法或 World Model，生成新的未来观察、环境或动作候选。这类数据不一定来自显式物理引擎。

**主要作用**：扩大视觉变化与任务组合、学习可能的未来世界状态、辅助数据增广。

**局限**：生成视频看起来合理，不代表对应机器人动作一定可执行；错误物理规律可能产生误导性监督。

## 一个重要的补充：失败数据也可能非常有价值

`失败` 不是一种必须被删除的数据类别。失败轨迹、人工干预和最终结果，若有可靠标签，可以用于 failure prediction、recovery policy、reward learning、offline RL 和 policy improvement。

但不要把没有质量标记的失败动作直接等同于专家示范，否则可能教模型模仿错误动作。

进一步看：[横向对比](?page=data-comparison) / [数据到训练的处理链](?page=data-pipeline) / [IL、RL 与世界模型](?page=learning-paradigms)。
