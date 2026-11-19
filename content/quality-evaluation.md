> **Data Quality ≠ 清晰画面 + 正确标注。** 真正有价值的数据，还要在正确的训练目标上对模型产生正向增益。

## 数据质量的四个层级

| 层级 | 核心问题 | 典型检查 |
|---|---|---|
| Integrity | 数据是否可信、能否正确对齐？ | timestamp、camera calibration、schema、missing frame |
| Demonstration Quality | 行动是否合理、标签是否正确？ | action validity、task success、annotation consistency |
| Diversity / Coverage | 覆盖了哪些实际变化？ | task、object、environment、robot、failure mode |
| Model Utility | 真的改善模型了吗？ | held-out success、ablation、generalization、recovery |

## 为什么画质不是唯一标准？

- 高分辨率但 Camera/Action 错位的示范，可能对动作学习有害。
- 模糊但正确标注失败恢复过程的数据，可能对某些恢复策略很有帮助。
- 10,000 次高度重复的抓取，可能不如变化丰富的 100 次示范带来的泛化信息多。
- 高度理想化仿真会让模型低估真实接触变化。

## 训练损失下降，不等于真实成功率上升

模型在 offline validation 上预测专家 action 更准确，不代表闭环执行一定更可靠。真实系统会积累控制误差、引入延迟，并进入训练时没覆盖的状态。

因此建议区分：

1. **Offline Metrics**：动作预测误差、重投影误差、数据一致性等；
2. **Closed-loop Task Metrics**：成功率、完成时间、干预率、碰撞/失败情况；
3. **Generalization**：未见环境、物体、指令、初始状态；
4. **Operational Metrics**：安全、恢复、延迟、可维护性和部署稳定性。

## A/B 与 Ablation 的重要性

评估某数据来源是否有价值，尽可能控制模型、训练预算和任务集不变，仅改变数据池或采样策略。例如：

- 去掉人类视频预训练，unseen object success 是否下降？
- 去掉失败/干预数据，恢复率是否下降？
- 增加某一机器人平台的数据，对其他平台有无帮助？

**跨公司的 60% vs 80% 如果任务定义、场景、硬件与成功标准不同，不能直接排名。**

## 知识连接

数据质量影响 [Data Recipe](?page=data-recipe)，评估结果决定下一轮 [Data Flywheel](?page=data-flywheel) 应该采集什么，而 VIO / TF / Calibration 等基础工程问题又会直接影响数据完整性。
