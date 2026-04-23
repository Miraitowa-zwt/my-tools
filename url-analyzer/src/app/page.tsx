'use client';

import { useState, useEffect, useCallback } from 'react';

type AnalysisResult = {
  sourceUrl: string;
  targetUrl: string;
  found: boolean;
  matches?: number;
  anchorData?: Array<{
    text: string;
    type: 'text' | 'image' | 'mixed';
  }>;
  finalUrl?: string;
  statusCode?: number;
  redirectCount: number;
  hasRedirect: boolean;
};

type JobStatus = {
  jobId: string;
  total: number;
  completed: number;
  results: AnalysisResult[];
  status: 'processing' | 'completed' | 'completed_with_errors';
  createdAt: string;
  errors?: Array<{
    sourceUrl: string;
    error: string;
  }>;
};

export default function Home() {
  const [sourceUrlsText, setSourceUrlsText] = useState('');
  const [targetUrlsText, setTargetUrlsText] = useState('');
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const parseUrls = (text: string): string[] => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  };

  const stopPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  };

  const fetchJobStatus = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`/api/job-status?jobId=${jobId}`);
      const data = await response.json();
      
      if (response.ok) {
        setJobStatus(data);
        
        if (data.status === 'completed' || data.status === 'completed_with_errors') {
          stopPolling();
          setIsLoading(false);
        }
      }
    } catch (error) {
      console.error('Error polling job status:', error);
    }
  }, []);

  const startAnalysis = async () => {
    const sourceUrls = parseUrls(sourceUrlsText);
    const targetUrls = parseUrls(targetUrlsText);
    
    if (sourceUrls.length === 0 || targetUrls.length === 0) {
      alert('请输入至少一个来源URL和一个目标URL');
      return;
    }

    setIsLoading(true);
    setJobStatus(null);
    stopPolling();

    try {
      const response = await fetch('/api/start-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceUrls,
          targetUrls,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start analysis');
      }

      const interval = setInterval(() => {
        fetchJobStatus(data.jobId);
      }, 1500);
      
      setPollingInterval(interval);
    } catch (error) {
      console.error('Error starting analysis:', error);
      alert(`启动分析失败: ${(error as Error).message}`);
      setIsLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (!jobStatus) return;
    window.open(`/api/export-excel?jobId=${jobStatus.jobId}`, '_blank');
  };

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const getStatusDotColor = (statusCode?: number) => {
    if (!statusCode) return 'bg-gray-300';
    if (statusCode >= 200 && statusCode < 300) return 'bg-green-500';
    if (statusCode >= 300 && statusCode < 400) return 'bg-yellow-400';
    if (statusCode >= 400 && statusCode < 500) return 'bg-red-500';
    return 'bg-gray-300';
  };

  const getAnchorTypeText = (type: string) => {
    switch (type) {
      case 'text': return '纯文本';
      case 'image': return '图片';
      case 'mixed': return '混合';
      default: return type;
    }
  };

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <h1 className="text-4xl font-semibold text-center mb-10 text-[#1d1d1f]">URL深度分析工具</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="flex flex-col">
          <h2 className="text-xl font-medium mb-3 text-[#1d1d1f]">来源页面 URL 列表</h2>
          <textarea
            value={sourceUrlsText}
            onChange={(e) => setSourceUrlsText(e.target.value)}
            placeholder="请输入来源URL列表，每行一个URL..."
            className="flex-1 min-h-[250px] p-4 rounded-xl border border-[#d2d2d7] bg-white/80 resize-vertical focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:border-transparent transition-all text-[#1d1d1f] placeholder:text-[#86868b]"
          />
        </div>

        <div className="flex flex-col">
          <h2 className="text-xl font-medium mb-3 text-[#1d1d1f]">目标链接 URL 列表</h2>
          <textarea
            value={targetUrlsText}
            onChange={(e) => setTargetUrlsText(e.target.value)}
            placeholder="请输入目标URL列表，每行一个URL..."
            className="flex-1 min-h-[250px] p-4 rounded-xl border border-[#d2d2d7] bg-white/80 resize-vertical focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:border-transparent transition-all text-[#1d1d1f] placeholder:text-[#86868b]"
          />
        </div>
      </div>

      <div className="flex justify-center mb-10 gap-4">
        <button
          onClick={startAnalysis}
          disabled={isLoading}
          className="px-12 py-4 bg-[#1d1d1f] text-white rounded-full text-lg font-medium transition-all duration-300 hover:bg-[#424245] hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? '分析进行中...' : '开始深度分析'}
        </button>

        {jobStatus && jobStatus.status !== 'processing' && (
          <button
            onClick={handleExportExcel}
            className="px-12 py-4 bg-white text-[#1d1d1f] border border-[#1d1d1f] rounded-full text-lg font-medium transition-all duration-300 hover:bg-gray-50 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
          >
            导出 Excel 报表
          </button>
        )}
      </div>

      {jobStatus && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[#1d1d1f] font-medium">
              分析进度: {jobStatus.completed} / {jobStatus.total}
            </span>
            <span className="text-[#86868b] text-sm">
              {jobStatus.status === 'processing' ? '处理中...' : 
               jobStatus.status === 'completed' ? '已完成' : '完成但有错误'}
            </span>
          </div>
          {/* Apple-style thin progress bar */}
          <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="bg-[#1d1d1f] h-full transition-all duration-500 ease-out"
              style={{ width: `${(jobStatus.completed / jobStatus.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-6 sm:p-8 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#e6e6e6]">
                <th className="text-left py-4 px-4 font-semibold text-[#1d1d1f]">来源 URL</th>
                <th className="text-left py-4 px-4 font-semibold text-[#1d1d1f]">目标 URL</th>
                <th className="text-left py-4 px-4 font-semibold text-[#1d1d1f]">找到</th>
                <th className="text-left py-4 px-4 font-semibold text-[#1d1d1f]">锚文本/类型</th>
                <th className="text-left py-4 px-4 font-semibold text-[#1d1d1f]">重定向</th>
                <th className="text-left py-4 px-4 font-semibold text-[#1d1d1f]">状态</th>
              </tr>
            </thead>
            <tbody>
              {!jobStatus || jobStatus.results.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-[#86868b]">
                    {isLoading ? '等待结果...' : '请点击「开始深度分析」按钮开始分析'}
                  </td>
                </tr>
              ) : (
                jobStatus.results.map((result, index) => (
                  <tr key={index} className="border-b border-[#e6e6e6] hover:bg-[#fafafa]">
                    <td className="py-4 px-4 text-[#1d1d1f] max-w-xs truncate" title={result.sourceUrl}>
                      {result.sourceUrl}
                    </td>
                    <td className="py-4 px-4 text-[#1d1d1f] max-w-xs truncate" title={result.targetUrl}>
                      {result.targetUrl}
                    </td>
                    <td className="py-4 px-4">
                      {result.found ? (
                        <span className="text-green-600 font-medium">是 ({result.matches})</span>
                      ) : (
                        <span className="text-gray-500">否</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {result.anchorData && result.anchorData.length > 0 ? (
                        <div className="space-y-1">
                          {result.anchorData.map((anchor, i) => (
                            <div key={i}>
                              <span className="inline-block px-2 py-1 text-xs rounded bg-blue-100 text-blue-800 mr-2">
                                {getAnchorTypeText(anchor.type)}
                              </span>
                              <span className="text-sm">{anchor.text || '(无文本)'}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {result.hasRedirect ? (
                        <span className="text-yellow-600">{result.redirectCount} 次</span>
                      ) : (
                        <span className="text-gray-500">无</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {result.statusCode ? (
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full ${getStatusDotColor(result.statusCode)}`} />
                          <span>{result.statusCode}</span>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {jobStatus?.errors && jobStatus.errors.length > 0 && (
          <div className="mt-6 p-4 bg-red-50 rounded-xl">
            <h3 className="font-semibold text-red-800 mb-2">错误信息:</h3>
            <ul className="list-disc list-inside text-sm text-red-700">
              {jobStatus.errors.map((err, i) => (
                <li key={i}>{err.sourceUrl}: {err.error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
