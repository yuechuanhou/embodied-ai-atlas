> **核心问题：机器人到底需要从数据中学会什么？** 它不只需要识别和理解世界，还需要采取动作，并通过真实交互持续改进。

这篇是整个知识库的 **起点（不是固定学习顺序）**。你可以从任何感兴趣的分支进入，并通过文章之间的链接回到更完整的技术闭环。

## 从一个真实任务出发

假设机器人收到指令：**“Go to the kitchen, pick up a cup, and place it on the table.”** 它需要的不只是语言理解。

| 能力层 | 它要解决的问题 | 典型技术 |
|---|---|---|
| Perception 感知 | 杯子在哪里？什么是桌子？ | Detection、Tracking、Depth、Pose |
| Understanding & Planning 理解与规划 | 先移动还是先抓取？顺序如何安排？ | VLM、Task Planning、Reasoning |
| Manipulation & Control 操作与控制 | 机械臂怎么动？夹爪什么时候闭合？ | VLA、Policy、IK、Control |
| Adaptation & Recovery 适应与恢复 | 抓取失败、遮挡、碰撞如何处理？ | Feedback、RL、Intervention |

这些能力从不同数据中学习。因此，同一家机器人公司可能同时需要人类视频、遥操、仿真、失败轨迹和数据标注。

## 从硬件到模型的知识闭环

```text
Physical World
      ↓
Robot Sensors & Actuators
(Camera / IMU / Joint Encoder / Gripper)
      ↓
Multimodal Data Collection
      ↓
Data Processing & Annotation
      ↓
Dataset / Data Recipe
      ↓
Pretraining + Fine-tuning + RL
      ↓
Robot Policy / VLA / World Model
      ↓
Deployment & Evaluation
      ↓
Failure / Correction / New Scenarios
      └──────────→ Data Collection (Flywheel)
```

其中 **Data Flywheel** 不是“采集越来越多文件”这么简单，而是必须有一条 **数据改善模型 → 模型创造新经验 → 新经验反过来改善模型** 的可验证路径。

## 一个 VLA 模型在学什么

简化的策略模型可以写成：

```text
πθ(a_t | o_t, l)

o_t = observation（图像、机器人状态、历史信息等）
l   = language instruction（任务指令）
a_t = action（关节命令、末端位姿变化或动作序列）
```

也就是说：**根据现在看到的环境和任务目标，预测应该怎么行动。** 但如果我们只有普通视频、没有动作记录，就不能直接使用相同的有监督动作损失。因此必须区分：[行为示范](?page=data-taxonomy)、[世界模型](?page=learning-paradigms)、[动作推断](?page=learning-paradigms)和[仿真交互](?page=data-comparison)等不同训练途径。

## 六个相互联系的主题

1. **机器人与感知基础**：Camera、IMU、Encoder、Coordinate Frame、URDF、TF、FK/IK、VIO、SLAM。
2. **数据来源与处理**：Real-World、Teleop、Human Video、UMI、Simulation、Synthetic；同步、标注、数据格式。
3. **模型架构与训练**：BC、IL、RL、Diffusion、Flow Matching、VLA、World Model、IDM。
4. **评估与部署**：成功率、泛化、鲁棒性、数据质量、干预和失败恢复。
5. **公司与行业路线**：GR00T、Physical Intelligence、Figure、1X、Gemini Robotics、TRI、AgiBot、Skild。
6. **知识连接**：术语、开源数据、论文、工程案例、不同研究方案的对比。

## 不要混淆的几个概念

- **Real-world data ≠ Teleoperation data**：前者指真实环境，后者指操作者控制的采集方式；两者可以同时成立。
- **Human video ≠ Robot action data**：人类视频通常不含可直接控制目标机器人的 joint action。
- **Data amount ≠ Training weight**：公司持有的小时数，不等于训练 batch 中的数据权重。
- **Model benchmark ≠ Deployment reliability**：不同公司的内部任务集与真实部署环境不一定可比较。
- **World Model ≠ Robot Policy**：世界模型预测状态如何演化；控制策略选择动作，两者可能结合但并不等价。

## 从哪里继续

根据你现在最关心的问题自由选择：[数据分类](?page=data-taxonomy) → [横向比较](?page=data-comparison) → [Data Recipe](?page=data-recipe) → [训练过程](?page=training-loop) → [行业案例](?page=industry-landscape)。也可以直接去看 [机器人技术基础](?page=robotics-stack) 或 [术语速查](?page=glossary)。
