import React, { useState, useEffect, useCallback } from 'react';

import {
  Card,
  Table,
  Button,
  Input,
  Space,
  Tag,
  Progress,
  Tooltip,
  message,
  Modal,
  Typography,
  Row,
  Col,
  Badge,
  Divider,
} from 'antd';

import {
  SearchOutlined,
  ReloadOutlined,
  DownloadOutlined,
  StopOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';

import dayjs from 'dayjs';
import DownloadModal from './DownloadModal';
import { useWebSocket } from '../hooks/useWebSocket';
import { symbolsApi, queueApi } from '../services/api';
import { Timeframe } from '../types';
import type { Symbol, JobUpdateData, TimeframeData } from '../types';

const { Text } = Typography;
const { confirm } = Modal;

interface SymbolsListProps {
  symbols: Symbol[];
  onRefresh: () => void;
}

const timeframes: Timeframe[] = [
  Timeframe.FIVE_MIN,
  Timeframe.FIFTEEN_MIN,
  Timeframe.THIRTY_MIN,
  Timeframe.ONE_HOUR,
  Timeframe.TWO_HOUR,
  Timeframe.FOUR_HOUR,
];

const SymbolsList: React.FC<SymbolsListProps> = ({ symbols, onRefresh }) => {
  const [filteredSymbols, setFilteredSymbols] = useState<Symbol[]>(symbols);
  const [searchText, setSearchText] = useState('');
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [selectedSymbolTimeframe, setSelectedSymbolTimeframe] = useState<{
    symbol: string;
    timeframe: Timeframe;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  // Update local symbols state when prop changes
  useEffect(() => {
    setFilteredSymbols(symbols);
  }, [symbols]);

  // Filter symbols based on search text
  useEffect(() => {
    if (!searchText.trim()) {
      setFilteredSymbols(symbols);
    } else {
      const filtered = symbols.filter(
        (symbol) =>
          symbol.symbol.toLowerCase().includes(searchText.toLowerCase()) ||
          symbol.baseAsset.toLowerCase().includes(searchText.toLowerCase()) ||
          symbol.quoteAsset.toLowerCase().includes(searchText.toLowerCase()),
      );
      setFilteredSymbols(filtered);
    }
  }, [searchText, symbols]);

  const handleSyncSymbols = async () => {
    try {
      setLoading(true);
      const response = await symbolsApi.syncSymbols();
      if (response.success) {
        message.success(
          response.message || 'Symbols synchronized successfully',
        );
        onRefresh();
      }
    } catch (error: any) {
      message.error(
        error.response?.data?.error?.message || 'Failed to sync symbols',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadClick = (symbol: string, timeframe: Timeframe) => {
    setSelectedSymbolTimeframe({ symbol, timeframe });
    setDownloadModalVisible(true);
  };

  const handleCancelJob = async (
    jobId: string,
    symbol: string,
    timeframe: Timeframe,
  ) => {
    confirm({
      title: 'Cancel Download Job',
      content: `Are you sure you want to cancel the download job for ${symbol} ${timeframe}?`,
      okText: 'Yes, Cancel',
      okType: 'danger',
      cancelText: 'No',
      onOk: async () => {
        try {
          const response = await queueApi.cancelJob(jobId);
          if (response.success) {
            message.success('Job cancelled successfully');
            onRefresh();
          }
        } catch (error: any) {
          message.error(
            error.response?.data?.error?.message || 'Failed to cancel job',
          );
        }
      },
    });
  };

  const handleDownloadSubmit = async (jobData: any) => {
    try {
      const response = await queueApi.createDownloadJob(jobData);
      if (response.success) {
        message.success(
          `Download job created for ${jobData.symbol} ${jobData.timeframe}`,
        );
        setDownloadModalVisible(false);
        setSelectedSymbolTimeframe(null);
        onRefresh();
      }
    } catch (error: any) {
      message.error(
        error.response?.data?.error?.message || 'Failed to create download job',
      );
    }
  };

  const renderTimeframeCell = (
    symbol: string,
    timeframe: Timeframe,
    data: TimeframeData,
  ) => {
    const { isLoading, loadingJob, earliestData, latestData, totalCandles } =
      data;

    if (isLoading && loadingJob) {
      return (
        <div style={{ minWidth: 200 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 4,
            }}
          >
            <Tag color="processing" icon={<SyncOutlined spin />}>
              {loadingJob.status.toUpperCase()}
            </Tag>
            <Button
              size="small"
              type="text"
              danger
              icon={<StopOutlined />}
              onClick={() =>
                handleCancelJob(loadingJob.jobId, symbol, timeframe)
              }
            >
              Cancel
            </Button>
          </div>
          <Progress
            percent={loadingJob.progress}
            size="small"
            status={loadingJob.error ? 'exception' : 'active'}
            format={(percent) => `${percent}%`}
          />
          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
            {loadingJob.processedCandles > 0 && (
              <span>
                {loadingJob.processedCandles.toLocaleString()} candles processed
              </span>
            )}
            {loadingJob.error && (
              <div style={{ color: '#ff4d4f', marginTop: 2 }}>
                <ExclamationCircleOutlined /> {loadingJob.error}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (totalCandles > 0) {
      return (
        <div style={{ minWidth: 200 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 4,
            }}
          >
            <Tag color="success" icon={<CheckCircleOutlined />}>
              {totalCandles.toLocaleString()} candles
            </Tag>
            <Button
              size="small"
              type="primary"
              icon={<DownloadOutlined />}
              onClick={() => handleDownloadClick(symbol, timeframe)}
            >
              Load More
            </Button>
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>
            <div>
              <Text type="secondary">From: </Text>
              {earliestData
                ? dayjs(earliestData).format('YYYY-MM-DD HH:mm')
                : 'N/A'}
            </div>
            <div>
              <Text type="secondary">To: </Text>
              {latestData
                ? dayjs(latestData).format('YYYY-MM-DD HH:mm')
                : 'N/A'}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ minWidth: 200 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
          }}
        >
          <Tag color="default" icon={<ClockCircleOutlined />}>
            No data
          </Tag>
          <Button
            size="small"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => handleDownloadClick(symbol, timeframe)}
          >
            Download
          </Button>
        </div>
        <div style={{ fontSize: 12, color: '#999' }}>
          Click download to start loading historical data
        </div>
      </div>
    );
  };

  const columns = [
    {
      title: 'Symbol',
      dataIndex: 'symbol',
      key: 'symbol',
      width: 120,
      fixed: 'left' as const,
      render: (symbol: string, record: Symbol) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{symbol}</div>
          <div style={{ fontSize: 12, color: '#666' }}>
            {record.baseAsset}/{record.quoteAsset}
          </div>
          {record.hasActiveJobs && (
            <Badge
              count="Active"
              style={{
                backgroundColor: '#52c41a',
                fontSize: 10,
                height: 16,
                lineHeight: '16px',
                marginTop: 2,
              }}
            />
          )}
        </div>
      ),
    },
    ...timeframes.map((timeframe) => ({
      title: timeframe.toUpperCase(),
      dataIndex: ['timeframes', timeframe],
      key: timeframe,
      width: 220,
      render: (data: TimeframeData, record: Symbol) =>
        renderTimeframeCell(record.symbol, timeframe, data),
    })),
    {
      title: 'Last Updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 140,
      render: (updatedAt: string) => (
        <div style={{ fontSize: 12, color: '#666' }}>
          {updatedAt ? dayjs(updatedAt).format('MM-DD HH:mm') : 'Never'}
        </div>
      ),
    },
  ];

  return (
    <Card
      title={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>Symbols & Historical Data</span>
          <Space>
            <Input
              placeholder="Search symbols..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
            <Button
              icon={<SyncOutlined />}
              onClick={handleSyncSymbols}
              loading={loading}
            >
              Sync Symbols
            </Button>
            <Button icon={<ReloadOutlined />} onClick={onRefresh}>
              Refresh
            </Button>
          </Space>
        </div>
      }
      size="small"
    >
      <div style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">Total Symbols</Text>
              <div style={{ fontSize: 24, fontWeight: 600, color: '#1890ff' }}>
                {filteredSymbols.length}
              </div>
            </div>
          </Col>
          <Col span={6}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">With Active Jobs</Text>
              <div style={{ fontSize: 24, fontWeight: 600, color: '#52c41a' }}>
                {filteredSymbols.filter((s) => s.hasActiveJobs).length}
              </div>
            </div>
          </Col>
          <Col span={6}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">With Data</Text>
              <div style={{ fontSize: 24, fontWeight: 600, color: '#722ed1' }}>
                {
                  filteredSymbols.filter((s) =>
                    Object.values(s.timeframes).some(
                      (tf) => tf.totalCandles > 0,
                    ),
                  ).length
                }
              </div>
            </div>
          </Col>
          <Col span={6}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">Empty</Text>
              <div style={{ fontSize: 24, fontWeight: 600, color: '#d9d9d9' }}>
                {
                  filteredSymbols.filter((s) =>
                    Object.values(s.timeframes).every(
                      (tf) => tf.totalCandles === 0,
                    ),
                  ).length
                }
              </div>
            </div>
          </Col>
        </Row>
      </div>

      <Divider />

      <Table
        columns={columns}
        dataSource={filteredSymbols}
        rowKey="symbol"
        scroll={{ x: 1400 }}
        pagination={{
          pageSize: 50,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) =>
            `${range[0]}-${range[1]} of ${total} symbols`,
        }}
        size="small"
        bordered
      />
      <DownloadModal
        visible={downloadModalVisible}
        onCancel={() => {
          setDownloadModalVisible(false);
          setSelectedSymbolTimeframe(null);
        }}
        onSubmit={handleDownloadSubmit}
        symbol={selectedSymbolTimeframe?.symbol || ''}
        timeframe={selectedSymbolTimeframe?.timeframe || Timeframe.FIVE_MIN}
      />
    </Card>
  );
};

export default SymbolsList;
