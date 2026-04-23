from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from .models import ScanConfig, ScanResult
from .scanner import Scanner
import asyncio
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="站内已添加链接检测工具",
    description="自动扫描站点内所有页面，找出链接到目标URL的页面并提取锚文本和上下文",
    version="1.0.0",
)


class ScanRequest(ScanConfig):
    pass


@app.get("/")
async def root():
    return {
        "message": "站内已添加链接检测工具 API",
        "endpoint": "/scan",
        "method": "POST",
        "documentation": "/docs",
    }


@app.post("/scan", response_model=ScanResult)
async def scan(request: ScanRequest):
    """开始扫描"""
    try:
        scanner = Scanner(request)
        result = await scanner.scan()
        return result
    except Exception as e:
        logger.error(f"Scan error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    """健康检查"""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
