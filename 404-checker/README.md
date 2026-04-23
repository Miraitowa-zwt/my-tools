# 404 链接检查器

批量检查网页中的坏链接（404等无效链接），支持并行检查，快速高效。

## 功能特性

- ✨ 支持两种模式：检查单个页面中的所有链接 / 批量检查文件中的URL列表
- ⚡ 并行检查，速度快
- 📊 清晰的结果输出，可保存到文件
- 🎯 自动去重，避免重复检查
- 🔍 自动提取网页中的所有链接

## 安装依赖

```bash
pip install -r requirements.txt
```

## 使用方法

### 1. 检查单个网页中的所有链接

```bash
python 404_checker.py -u https://example.com
```

### 2. 批量检查文件中的URL列表

文件格式：每行一个URL，忽略以`#`开头的注释行

```bash
python 404_checker.py -f urls.txt
```

### 3. 输出结果到文件

```bash
python 404_checker.py -u https://example.com -o result.txt
```

### 4. 自定义并发数和超时

```bash
python 404_checker.py -u https://example.com -w 50 -t 15
```

参数说明：
- `-u` / `--url`: 要检查的网页URL
- `-f` / `--file`: 包含URL列表的文件路径
- `-o` / `--output`: 结果输出文件路径（可选）
- `-t` / `--timeout`: 请求超时时间（秒），默认10秒
- `-w` / `--workers`: 最大并发数，默认20
- `-v` / `--verbose`: 显示详细进度（默认开启）

## 示例

```
============================================================
链接检查完成，共检查 42 个链接
✓ 有效链接: 38
✗ 无效链接: 4
============================================================

无效链接列表:
------------------------------------------------------------
状态码   URL
------------------------------------------------------------
404     https://example.com/broken-link
403     https://example.com/private-page
ERROR   https://not-exists.example.com
        错误: Could not resolve host
```

## 退出码

- `0`: 没有发现无效链接
- `1`: 发现至少一个无效链接，方便集成到CI/CD流程

## 许可

MIT License
