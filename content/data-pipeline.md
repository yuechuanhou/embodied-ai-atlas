> 一段机器人动作最终变成模型能读取的 `(observation, action)` 样本，中间要经历的步骤往往比预想多得多。

## Step 1：采集一段 Episode

假设人类遥操机械臂完成 `Pick up the cup and place it in the tray`。一个 episode 可能含有：

```text
episode_001/
  RGB / Depth / Wrist Cameras
  Joint positions, velocities
  End-effector pose / gripper state
  Robot actions / control commands
  Timestamps / clock source
  Task instruction / outcome
  Camera calibration / robot config
```

**Episode** 通常是一段以某个任务为单位组织的交互轨迹。它不一定只包含成功数据，也不一定有统一时长。

## Step 2：Decode → Synchronize → Calibrate → Align

```text
Raw Data (MCAP / ROS bag / device log)
    ↓ Decode
Video / IMU / Robot State / Action
    ↓ Timestamp Synchronization
Unified temporal reference
    ↓ Calibration + Coordinate Transform
Comparable frames and units
    ↓ Action–Observation Alignment
(o_t, a_t) or (o_t, a_t...a_{t+H})
    ↓ Segmentation / Annotation / Filtering
Training-ready dataset
```

一个具体问题：Camera 是 30Hz、Joint State 是 100Hz、IMU 是 200Hz。不能简单按“第 n 个数据对应第 n 个图像”匹配；应当使用定义明确的时间戳与采样/插值策略。

## Step 3：建立 Schema

典型训练样本：

```json
{
  "timestamp": 12.53,
  "observation": {
    "image_front": "video frame reference",
    "joint_positions": [0.12, -0.34, 0.9],
    "gripper_opening": 0.04
  },
  "action": {
    "ee_delta_pose": [0.02, 0, 0, 0, 0, 0],
    "gripper_command": "close"
  },
  "instruction": "pick up the cup",
  "outcome": "success"
}
```

这是**示意 Schema**，并非某家数据集的真实字段定义。数据工程最需要核实的是：动作是 joint target、delta pose、torque 还是 velocity？使用哪个 frame？时间戳代表采样时间还是发布/到达时间？

## 常见存储格式

| 格式 | 典型用途 | 注意点 |
|---|---|---|
| `.mcap` | 多 topic 时间序列日志 | 容器可同时保存 raw 和 processed data |
| `.mp4` / `.jpg` / `.png` | 视频/帧 | 编码方式、fps、关键帧、色彩格式 |
| `.parquet` | 结构化 Robot State / Action / Meta | 列式压缩、适合大数据读取 |
| `.hdf5` | 多模态数组和 Episode | 结构灵活、生态兼容依赖 Schema |
| `.json` / `.jsonl` | Annotation、Task、Metadata | 可读，但大规模数值序列不一定高效 |
| `.npy` / `.npz` | 数值数组、tensor | 简单直接，需额外元数据约定 |

一种常见组合是 `MP4 + Parquet + JSON metadata`；HDF5 则可能将多种模态组织在单一容器中。

**注意：LeRobotDataset v3.0** 使用 Parquet 与 MP4 分片及 metadata 索引，一个文件可包含多个 episode；不是每个 episode 必须拥有独立 MP4。参见 [Hugging Face 官方说明](https://huggingface.co/docs/lerobot/lerobot-dataset-v3)。

## 三个常见工程失误

1. **Timestamp mismatch**：传感器时间基不统一，动作和帧错位。
2. **Coordinate mismatch**：Camera Frame、Base Frame、World Frame 混用，导致物体位置与动作不一致。
3. **Action semantic mismatch**：把 commanded action 当作 measured state，把 position target 当作 velocity。

这些问题会导致模型学习到错误对应关系，即使每个文件“看起来都能播放”。

## 接回机器人基础知识

[Camera / IMU / Encoder](?page=sensors-and-estimation) → [URDF / TF / Coordinate](?page=geometry-and-frames) → [MCAP / 软件格式](?page=file-formats) → Data Processing → [Model Training](?page=training-loop)。
