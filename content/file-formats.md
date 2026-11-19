> 机器人系统的数据格式、文件容器和软件接口属于不同层面。数据工程需要同时理解它们。

## SDK / API / ROS

- **API**：某项能力的调用接口，如 `getJointState()`。
- **Library**：提供功能实现的代码库。
- **SDK**：包括 API、library、文档、示例和工具的开发工具包。
- **ROS Topic / Service / Action**：机器人软件之间通信与交互的机制。

“通过 SDK 接入机器人软件”通常是指通过厂商开放的接口读取状态、获取图像或执行动作，而不是直接改写电机固件。

## MCAP / rosbag

**MCAP** 是多模态、带时间戳消息的日志文件格式，可记录 ROS topics、schemas、channels 和 metadata。**rosbag2** 则是录制/回放的框架，可以使用 MCAP 作为存储后端。

```text
Robot Topics → rosbag2 → .mcap
                         ↓
             Decode / Sync / Process
                         ↓
                Training Dataset
```

一个 `.mcap` 内可以既有 raw image、IMU，也有 processed detection、VIO pose，所以 MCAP 本身不能说明数据是否经过处理。

## YUV420P

`YUV` 分离亮度（Y）和色度（U/V），`4:2:0` 表示每个 2×2 像素块共享一个 U 与一个 V，`P` 表示 planar：Y、U、V 分平面存储。

对于 8-bit YUV420P，平均约 1.5 bytes/pixel，而 RGB24 是 3 bytes/pixel。该格式常见于视频编码和 Camera pipeline；训练视觉模型前可能需要转成 RGB tensor。

## XML / URDF

XML 是用层级标签组织结构化信息的语言；URDF 是定义机器人 link/joint 语义的一套 XML 规范。

```xml
<robot name="demo">
  <link name="base_link"/>
</robot>
```

## UUID / SHA-256

- **UUID**：128-bit 对象标识符，常用于 session、episode、robot ID；UUID v4 主要基于随机数。
- **SHA-256**：将任意长度数据映射为 256-bit 的 cryptographic digest，常用于数据/文件完整性校验。它不是可逆加密，也不保证数学上的绝对唯一。

## 其他常见词

**QA** 是 Quality Assurance（质量保证）；**DFM** 是 Design for Manufacturing（面向制造设计）；**ADAS** 是 Advanced Driver Assistance Systems（高级驾驶辅助系统）。

更多：[术语速查](?page=glossary)。
