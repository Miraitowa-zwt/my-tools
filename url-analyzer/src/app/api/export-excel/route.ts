import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
const { getRedisClient } = require('../../../../lib/queue');

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId parameter is required' },
        { status: 400 }
      );
    }

    const redis = getRedisClient();
    const jobData = await redis.get(`job:${jobId}`);
    await redis.disconnect();

    if (!jobData) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    const parsedData = JSON.parse(jobData);
    const results = parsedData.results;

    // Group results by source URL
    const groupedResults: Record<string, any[]> = {};
    results.forEach((result: any) => {
      if (!groupedResults[result.sourceUrl]) {
        groupedResults[result.sourceUrl] = [];
      }
      groupedResults[result.sourceUrl].push(result);
    });

    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('URL Analysis Result');
    
    // Set columns
    worksheet.columns = [
      { header: '来源页面', key: 'sourceUrl', width: 50 },
      { header: '目标 URL', key: 'targetUrl', width: 50 },
      { header: '是否找到', key: 'found', width: 12 },
      { header: '锚文本', key: 'anchorText', width: 30 },
      { header: '锚文本类型', key: 'anchorType', width: 14 },
      { header: '重定向次数', key: 'redirectCount', width: 14 },
      { header: '最终状态码', key: 'statusCode', width: 14 },
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'E5E5E5' },
    };
    worksheet.getRow(1).height = 20;

    let currentRow = 2;

    // Add grouped data with outline levels
    for (const [sourceUrl, matches] of Object.entries(groupedResults)) {
      if (matches.length === 1 && matches[0].found === false) {
        // Add single row for no matches
        const row = worksheet.getRow(currentRow);
        row.getCell('sourceUrl').value = sourceUrl;
        row.getCell('targetUrl').value = matches[0].targetUrl;
        row.getCell('found').value = '否';
        row.getCell('anchorText').value = '-';
        row.getCell('anchorType').value = '-';
        row.getCell('redirectCount').value = matches[0].redirectCount || 0;
        row.getCell('statusCode').value = matches[0].statusCode || '-';
        row.outlineLevel = 1;
        currentRow++;
      } else {
        // Add summary row (level 1)
        const summaryRow = worksheet.getRow(currentRow);
        summaryRow.getCell('sourceUrl').value = sourceUrl;
        summaryRow.getCell('targetUrl').value = `${matches.length} 个匹配目标`;
        summaryRow.getCell('found').value = `${matches.filter(m => m.found).length}/${matches.length}`;
        summaryRow.outlineLevel = 0;
        currentRow++;

        // Add detail rows (level 2)
        matches.forEach((result: any) => {
          if (result.anchorData && result.anchorData.length > 0) {
            result.anchorData.forEach((anchor: any) => {
              const detailRow = worksheet.getRow(currentRow);
              detailRow.getCell('sourceUrl').value = '';
              detailRow.getCell('targetUrl').value = result.targetUrl;
              detailRow.getCell('found').value = result.found ? '是' : '否';
              detailRow.getCell('anchorText').value = anchor.text || '(无文本)';
              detailRow.getCell('anchorType').value = getAnchorTypeName(anchor.type);
              detailRow.getCell('redirectCount').value = result.redirectCount || 0;
              detailRow.getCell('statusCode').value = result.statusCode || '-';
              detailRow.outlineLevel = 1;
              currentRow++;
            });
          } else {
            const detailRow = worksheet.getRow(currentRow);
            detailRow.getCell('sourceUrl').value = '';
            detailRow.getCell('targetUrl').value = result.targetUrl;
            detailRow.getCell('found').value = result.found ? '是' : '否';
            detailRow.getCell('anchorText').value = '-';
            detailRow.getCell('anchorType').value = '-';
            detailRow.getCell('redirectCount').value = result.redirectCount || 0;
            detailRow.getCell('statusCode').value = result.statusCode || '-';
            detailRow.outlineLevel = 1;
            currentRow++;
          }
        });
      }
    }

    // Enable outlining (outline levels are already set on each row)
    (worksheet.properties as any).outline = {
      summaryBelow: false,
    };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Return Excel file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="url-analysis-${jobId.slice(0, 8)}.xlsx"`,
      },
    });

  } catch (error) {
    console.error('Error generating Excel:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function getAnchorTypeName(type: string): string {
  switch (type) {
    case 'text': return '纯文本';
    case 'image': return '图片';
    case 'mixed': return '混合';
    default: return type;
  }
}
