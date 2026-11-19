> 可用网页左上角搜索直接查找术语；这里保留跨主题的中英对照与最短定义。完整解释通过链接跳转。

| Term | 中文 | 直觉 / 对应专题 |
|---|---|---|
| Embodied AI | 具身智能 | 智能通过身体在环境中感知和行动；[总览](?page=overview) |
| Multimodal Data | 多模态数据 | 视频、IMU、关节、语言等；[数据](?page=data-taxonomy) |
| Real-World Data | 真实世界数据 | 在真实环境产生 |
| Teleoperation | 遥操作 | 人类远程控制机器人完成任务 |
| Rollout | 策略运行轨迹 | 策略执行产生的状态、动作与结果序列 |
| UMI | 通用操作接口 | 带相机的手持工具采集操作示范 |
| Episode | 单次交互/任务轨迹 | 通常按一次任务组织多模态数据 |
| Data Recipe | 训练数据配方 | 来源、处理、采样、阶段、学习目标；[专题](?page=data-recipe) |
| Data Flywheel | 数据飞轮 | 部署数据持续改善模型的闭环；[专题](?page=data-flywheel) |
| Observation | 观测 | 相机、状态及历史信息等模型输入 |
| Action | 动作 | 策略输出的关节、末端或夹爪命令 |
| Action Chunk | 动作块 | 一次预测多个未来 action；[解释](?page=training-loop) |
| Policy | 策略 | 观测/目标到动作的映射 |
| BC | 行为克隆 | 监督模仿专家动作 |
| IL | 模仿学习 | 从专家行为学习；[专题](?page=learning-paradigms) |
| RL | 强化学习 | 从交互反馈优化策略 |
| VLM | 视觉语言模型 | 结合视觉与文本理解 |
| VLA | 视觉语言动作模型 | 视觉/语言/状态 → 机器人动作 |
| World Model | 世界模型 | 预测状态、观测或未来环境变化 |
| IDM | 逆动力学模型 | 前后状态 → 可能的动作 |
| WAM | 世界动作模型 | 联合学习世界变化与行动 |
| Diffusion Policy | 扩散策略 | 以扩散过程生成连续动作 |
| Flow Matching | 流匹配 | 学习分布之间的连续变换 |
| Camera Intrinsics | 相机内参 | 焦距、主点、畸变等 |
| Camera Extrinsics | 相机外参 | 相机和其他 frame 的空间关系 |
| Stereo Camera | 双目相机 | 两视角三角测量深度 |
| Fisheye Camera | 鱼眼相机 | 大 FOV / 特殊投影 |
| IMU | 惯性测量单元 | 比力、角速度；[传感器](?page=sensors-and-estimation) |
| Encoder | 编码器 | 轴角度、旋转位移或速度 |
| VIO | 视觉惯性里程计 | Camera + IMU 估计运动 |
| SLAM | 同步定位与建图 | 估计姿态并建立地图 |
| 6DoF Pose | 六自由度位姿 | 3D 平移 + 3D 朝向 |
| TF Tree | 坐标变换树 | 运行时 frame 的父子变换关系 |
| URDF | 机器人描述格式 | 基于 XML 的 links/joints 描述 |
| FK / IK | 正/逆运动学 | Joint → EE pose / EE target → Joint |
| SDK | 软件开发工具包 | API、库、文档和工具 |
| MCAP | 多模态日志容器格式 | 时间序列消息记录 |
| Parquet | 列式数据格式 | 常存 robot state/action 序列 |
| HDF5 | 分层数据文件 | 存数组与多模态数据 |
| UUID | 通用唯一标识符 | 标识 session/episode/object |
| SHA-256 | 哈希算法 | 文件内容摘要和完整性校验 |
| YUV420P | 视频像素格式 | 亮度全分辨率、色度下采样、planar |
| MPJPE | 平均关节位置误差 | 3D pose 估计关节欧氏误差均值 |
| QA | 质量保证 | 流程、验证与发布质量 |
| DFM | 可制造性设计 | 设计阶段考虑制造成本、良率 |
| ADAS | 高级驾驶辅助 | 车辆感知与驾驶辅助控制 |

这份 glossary 是**索引**而不是最终完整定义。随着专题深入，每个重要术语都可以发展为独立文章。
