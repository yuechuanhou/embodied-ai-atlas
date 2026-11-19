> 机器人学习不只关心神经网络：Sensor、Coordinate、Kinematics、Logging 与 Runtime Control 会直接决定训练数据质量及策略是否可执行。

## 从机器人硬件到学习数据

```text
Camera / LiDAR / IMU / Encoder
              ↓
    Timestamped Observations
              ↓
      State Estimation
         VIO / SLAM
              ↓
  Coordinate Frames / TF Tree
              ↓
    Robot State & Actions
              ↓
   MCAP → Dataset Pipeline
              ↓
      VLA / Policy Model
              ↓
  IK / Planner / Controller
              ↓
    Motor / Actuator
```

## 关键概念如何分工

| 技术 | 它回答的问题 |
|---|---|
| Camera / Depth | 周围看到了什么，物体在哪里？ |
| Encoder | 电机轴/关节转了多少，转得多快？ |
| IMU | 设备如何加速和旋转？ |
| VIO | 用 Camera + IMU 估计连续运动？ |
| SLAM | 如何同时定位并建图？ |
| URDF | 机器人有哪些 links / joints？ |
| TF Tree | 不同 frames 在某个时刻如何变换？ |
| FK | 已知关节角，末端在哪里？ |
| IK | 已知目标末端 pose，关节应怎样配置？ |
| MCAP | 如何记录多模态时间序列消息？ |

## 为什么这会影响 Data Recipe？

如果 camera-to-base 外参不准确、action 时间戳错位，模型可能学到错误动作。如果 URDF 的 joint axis 定义错了，IK 或运动规划会生成错误解。上游工程问题最终会表现为数据质量和闭环执行失败。

## 推荐的自然延伸

可以直接点击 [坐标系、URDF、TF、FK/IK](?page=geometry-and-frames) 或 [IMU、Camera、VIO、SLAM](?page=sensors-and-estimation)。这里仅作为连接知识的入口，不要求按固定顺序学习。
