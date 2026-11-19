> **Data Flywheel** 不是把数据不停存储，而是“运行 → 发现问题 → 有针对性采集 → 模型改善 → 再部署”的正反馈系统。

## 完整闭环

```text
Robot Deployment
       ↓
Real-world Execution
       ↓
Data + Success / Failure / Intervention
       ↓
Failure Analysis & Data Selection
       ↓
Clean / Label / Balance / Mix
       ↓
Train / Fine-tune / RL
       ↓
Evaluate on Held-out Real Tasks
       ↓
Deploy Better Policy
       └────────────────→ New Experiences
```

其中每个箭头都值得追问。比如：部署是否覆盖不同环境？失败由谁定义？人工干预记录了什么？新数据如何避免重复？模型改善是否经过可比较的真实测试？

## 一个 Pick & Place 例子

1. V1 policy 学会从杯子顶部抓取，但碰到透明杯时频繁失败。
2. 系统检测失败并记录前后视频、动作轨迹、夹爪状态和失败类型。
3. 人类纠正或重新演示适用于透明杯的抓取策略。
4. 训练时提高透明物体/失败恢复数据的相对权重。
5. 使用未见过的新透明杯评估 V2 是否真正改善。
6. 将新模型部署到更多环境，继续采集新分布的失败。

如果只是 V2 在原始训练集上表现更好，而真实场景没改善，这个飞轮并没有有效闭合。

## 常见瓶颈

- **Collection bottleneck**：设备和操作员限制数据规模。
- **Quality bottleneck**：时间错位、动作不可用、标注不一致。
- **Learning bottleneck**：新增数据不适合当前模型或训练目标。
- **Evaluation bottleneck**：缺乏统一、可重复且代表真实分布的评测。
- **Deployment bottleneck**：推理延迟、安全策略、可靠性限制上线。

## 行业里的不同实现

- [Physical Intelligence](?page=company-pi)：自主经验、人工纠正和奖励/质量信号帮助 policy improve。
- [Figure](?page=company-figure)：扩大人类行为视频来源，并将训练能力应用于人形机器人。
- [Skild AI](?page=company-skild)：强调多数据源组合和视频示范 In-Context Learning 的扩展性。
- [NVIDIA](?page=company-nvidia)：通过大规模 human video + UMI + robot teleop 支持跨形态迁移。

## 最核心的衡量方式

不是“每天又增加了多少小时视频”，而是 **单位新增有效数据带来了多大可验证的模型能力增益**。这一点把数据工程、ML 研究、机器人系统集成和产品部署连接成同一件事。
