import React, { useCallback, useState, useEffect } from 'react';

import {
  Layout,
  Typography,
  Space,
  Spin,
  Alert,
  Card,
  Statistic,
  Row,
  Col,
} from 'antd';

import {
  DashboardOutlined,
  ApiOutlined,
  SettingOutlined,
} from '@ant-design/icons';

import SymbolsList from './components/SymbolsList';
// import TokenManagement from './components/TokenManagement';
import { useWebSocket } from './hooks/useWebSocket';
import { symbolsApi } from './services/api';
import type { Symbol, JobStatistics, SymbolStatistics } from './types';
import './App.css';

const { Header, Content, Sider } = Layout;
const { Title } = Typography;

type ActiveTab = 'dashboard' | 'tokens' | 'settings';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [symbols, setSymbols] = useState<Symbol[]>([]);
  const [statistics, setStatistics] = useState<{
    symbols: SymbolStatistics;
    jobs: JobStatistics;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // WebSocket event handlers
  const handleJobUpdate = useCallback((data: any) => {
    setSymbols((prevSymbols) =>
      prevSymbols.map((symbol) => {
        if (symbol.symbol === data.symbol) {
          return {
            ...symbol,
            timeframes: {
              ...symbol.timeframes,
              [data.timeframe]: {
                //@ts-ignore
                ...symbol.timeframes[data.timeframe],
                isLoading: data.status === 'running',
                loadingJob:
                  data.status === 'running'
                    ? {
                        jobId: data.jobId,
                        status: data.status,
                        progress: data.progress || 0,
                        processedCandles: data.processedCandles || 0,
                        totalCandles: data.totalCandles || 0,
                        startedAt: data.startedAt,
                        error: data.error,
                        startDate: data.startDate,
                        endDate: data.endDate,
                      }
                    : null,
              },
            },
          };
        }
        return symbol;
      }),
    );
  }, []);

  const handleJobCreated = useCallback((data: any) => {
    // Refresh symbols to get updated loading states
    loadInitialData();
  }, []);

  const handleJobCompleted = useCallback((data: any) => {
    // When job completes, refresh the symbol data to get updated statistics
    setTimeout(() => loadInitialData(), 1000);
  }, []);

  const handleStatisticsUpdate = useCallback((data: any) => {
    setStatistics(data);
  }, []);

  const handleSymbolsUpdate = useCallback((data: any) => {
    setSymbols(data.symbols);
  }, []);

  const { isConnected, connectionError } = useWebSocket({
    onJobUpdate: handleJobUpdate,
    onJobCreated: handleJobCreated,
    onJobCompleted: handleJobCompleted,
    onJobFailed: handleJobCompleted, // Same handler - refresh data
    onStatisticsUpdate: handleStatisticsUpdate,
    onSymbolsUpdate: handleSymbolsUpdate,
    onSystemNotification: (data: any) => {
      // System notifications are handled by the WebSocket hook
    },
  });

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [symbolsResponse, statsResponse] = await Promise.all([
        symbolsApi.getSymbolsWithLoadingStatus(),
        symbolsApi.getStatistics(),
      ]);

      if (symbolsResponse.success && symbolsResponse.data) {
        setSymbols(symbolsResponse.data);
      }

      if (statsResponse.success && statsResponse.data) {
        setStatistics(statsResponse.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Refresh statistics only occasionally (most updates come via WebSocket)
  useEffect(() => {
    const interval = setInterval(async () => {
      // Only refresh if not connected to WebSocket
      if (!isConnected) {
        try {
          const statsResponse = await symbolsApi.getStatistics();
          if (statsResponse.success && statsResponse.data) {
            setStatistics(statsResponse.data);
          }
        } catch (err) {
          // Ignore errors for background updates
        }
      }
    }, 120000); // Every 2 minutes and only when WS is disconnected

    return () => clearInterval(interval);
  }, [isConnected]);

  const menuItems = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: 'tokens',
      icon: <ApiOutlined />,
      label: 'API Tokens',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
    },
  ];

  const renderContent = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading symbols...</div>
        </div>
      );
    }

    if (error) {
      return (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          style={{ margin: '20px 0' }}
        />
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {statistics && (
              <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="Active Symbols"
                      value={statistics.symbols.activeSymbols}
                      suffix={`/ ${statistics.symbols.totalSymbols}`}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="Running Jobs"
                      value={statistics.jobs.running}
                      valueStyle={{ color: '#1890ff' }}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="Completed Jobs"
                      value={statistics.jobs.completed}
                      valueStyle={{ color: '#52c41a' }}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="Failed Jobs"
                      value={statistics.jobs.failed}
                      valueStyle={{ color: '#ff4d4f' }}
                    />
                  </Card>
                </Col>
              </Row>
            )}
            <SymbolsList symbols={symbols} onRefresh={loadInitialData} />
          </Space>
        );
      case 'tokens':
        return <div>TokenManagement</div>;
      case 'settings':
        return (
          <Card title="Settings">
            <p>Settings panel coming soon...</p>
          </Card>
        );
      default:
        return null;
    }
  };

  // return <TokenManagement />;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          background: '#fff',
          padding: '0 24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Title level={3} style={{ margin: 0, color: '#1890ff' }}>
            Binance History Service
          </Title>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 12px',
              borderRadius: 6,
              background: isConnected ? '#f6ffed' : '#fff2f0',
              border: `1px solid ${isConnected ? '#b7eb8f' : '#ffb3b3'}`,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: isConnected ? '#52c41a' : '#ff4d4f',
              }}
            />
            <span
              style={{
                fontSize: 12,
                color: isConnected ? '#52c41a' : '#ff4d4f',
                fontWeight: 500,
              }}
            >
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </Header>

      <Layout>
        <Sider width={200} style={{ background: '#fff' }}>
          <div style={{ padding: '16px 0' }}>
            {menuItems.map((item) => (
              <div
                key={item.key}
                onClick={() => setActiveTab(item.key as ActiveTab)}
                style={{
                  padding: '12px 24px',
                  cursor: 'pointer',
                  background:
                    activeTab === item.key ? '#e6f7ff' : 'transparent',
                  borderRight:
                    activeTab === item.key ? '2px solid #1890ff' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: activeTab === item.key ? '#1890ff' : '#666',
                  fontWeight: activeTab === item.key ? 500 : 400,
                }}
              >
                {item.icon}
                {item.label}
              </div>
            ))}
          </div>
        </Sider>

        <Layout style={{ padding: '24px' }}>
          <Content style={{ background: '#fff', padding: 24, borderRadius: 8 }}>
            {connectionError && (
              <Alert
                message="WebSocket Connection Error"
                description={connectionError}
                type="warning"
                closable
                style={{ marginBottom: 16 }}
              />
            )}
            {renderContent()}
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default App;
