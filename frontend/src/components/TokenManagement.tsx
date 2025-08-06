/*
import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Space,
  Typography,
  Tag,
  Popconfirm,
  message,
  Alert,
  Tooltip,
  Row,
  Col,
  Statistic,
  Empty,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  KeyOutlined,
  InfoCircleOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import dayjs from 'dayjs';
import { authApi, symbolsApi } from '../services/api';
import type { ApiToken, CreateTokenRequest } from '../types';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

// Validation schema for token creation
const tokenSchema = yup.object().shape({
  name: yup
    .string()
    .required('Token name is required')
    .min(3, 'Name must be at least 3 characters')
    .max(50, 'Name must not exceed 50 characters'),
  description: yup
    .string()
    .max(200, 'Description must not exceed 200 characters'),
  expiresInDays: yup
    .number()
    .positive('Expiration must be positive')
    .max(365, 'Maximum expiration is 365 days')
    .nullable(),
  permissions: yup
    .array()
    .of(yup.string())
    .min(1, 'At least one permission is required'),
});

interface TokenFormData {
  name: string;
  description?: string;
  expiresInDays?: number;
  permissions: string[];
}

const TokenManagement: React.FC = () => {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createdToken, setCreatedToken] = useState<{
    token: string;
    visible: boolean;
  } | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TokenFormData>({
    resolver: yupResolver(tokenSchema),
    defaultValues: {
      name: '',
      description: '',
      expiresInDays: 30,
      permissions: ['read'],
    },
  });

  const loadTokens = async () => {
    if (!symbolsApi.hasToken()) {
      return; // Don't try to load tokens if we don't have authentication
    }
    
    try {
      setLoading(true);
      const response = await authApi.listTokens();
      if (response.success) {
        setTokens(response.data || []);
      }
    } catch (error: any) {
      if (error.response?.status !== 401) {
        message.error('Failed to load tokens');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTokens();
  }, []);

  const handleCreateToken = async (data: TokenFormData) => {
    try {
      const response = await authApi.createToken(data);
      if (response.success) {
        setCreatedToken({
          token: response.data!.token,
          visible: false,
        });
        setCreateModalVisible(false);
        reset();
        loadTokens();
        message.success('API token created successfully');
      }
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || 'Failed to create token');
    }
  };

  const handleDeleteToken = async (tokenId: string) => {
    try {
      const response = await authApi.revokeToken(tokenId);
      if (response.success) {
        message.success('Token revoked successfully');
        loadTokens();
      }
    } catch (error: any) {
      message.error('Failed to revoke token');
    }
  };

  const handleUseToken = (token: string) => {
    symbolsApi.setToken(token);
    message.success('Token set successfully. You can now access the API.');
    window.location.reload(); // Refresh to update UI
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('Token copied to clipboard');
    });
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: ApiToken) => (
        <div>
          <div style={{ fontWeight: 600 }}>{name}</div>
          {record.description && (
            <div style={{ fontSize: 12, color: '#666' }}>{record.description}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Permissions',
      dataIndex: 'permissions',
      key: 'permissions',
      render: (permissions: string[]) => (
        <Space>
          {permissions.map(permission => (
            <Tag key={permission} color={permission === 'admin' ? 'red' : 'blue'}>
              {permission}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Usage',
      key: 'usage',
      render: (record: ApiToken) => (
        <div>
          <div>{record.requestCount.toLocaleString()} requests</div>
          <div style={{ fontSize: 12, color: '#666' }}>
            Last used: {record.lastUsedAt ? dayjs(record.lastUsedAt).format('MM-DD HH:mm') : 'Never'}
          </div>
        </div>
      ),
    },
    {
      title: 'Expires',
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (expiresAt: string) => {
        if (!expiresAt) return <Tag color="green">Never</Tag>;
        
        const expiry = dayjs(expiresAt);
        const isExpired = expiry.isBefore(dayjs());
        const isExpiringSoon = expiry.isBefore(dayjs().add(7, 'day'));
        
        return (
          <div>
            <Tag color={isExpired ? 'red' : isExpiringSoon ? 'orange' : 'green'}>
              {isExpired ? 'Expired' : expiry.format('YYYY-MM-DD')}
            </Tag>
          </div>
        );
      },
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (createdAt: string) => dayjs(createdAt).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (record: ApiToken) => (
        <Space>
          <Popconfirm
            title="Delete Token"
            description="Are you sure you want to revoke this token? This action cannot be undone."
            onConfirm={() => handleDeleteToken(record._id)}
            okText="Yes, Delete"
            cancelText="Cancel"
            okType="danger"
          >
            <Button danger type="text" icon={<DeleteOutlined />} size="small">
              Revoke
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (!symbolsApi.hasToken()) {
    return (
      <Card title="API Token Management">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No API token configured"
        >
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalVisible(true)}
          >
            Create First Token
          </Button>
        </Empty>

        <Modal
          title="Create API Token"
          open={createModalVisible}
          onCancel={() => {
            setCreateModalVisible(false);
            reset();
          }}
          footer={null}
          width={600}
        >
          <Form layout="vertical" onFinish={handleSubmit(handleCreateToken)}>
            <Form.Item
              label="Token Name"
              help={errors.name?.message}
              validateStatus={errors.name ? 'error' : ''}
            >
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <Input {...field} placeholder="e.g., Production API Access" />
                )}
              />
            </Form.Item>

            <Form.Item
              label="Description (Optional)"
              help={errors.description?.message}
              validateStatus={errors.description ? 'error' : ''}
            >
              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <TextArea {...field} rows={3} placeholder="Token description..." />
                )}
              />
            </Form.Item>

            <Form.Item
              label="Permissions"
              help={errors.permissions?.message}
              validateStatus={errors.permissions ? 'error' : ''}
            >
              <Controller
                name="permissions"
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    mode="multiple"
                    placeholder="Select permissions"
                    options={[
                      { label: 'Read', value: 'read' },
                      { label: 'Write', value: 'write' },
                      { label: 'Admin', value: 'admin' },
                    ]}
                  />
                )}
              />
            </Form.Item>

            <Form.Item
              label="Expires In (Days)"
              help={errors.expiresInDays?.message}
              validateStatus={errors.expiresInDays ? 'error' : ''}
            >
              <Controller
                name="expiresInDays"
                control={control}
                render={({ field }) => (
                  <InputNumber
                    {...field}
                    style={{ width: '100%' }}
                    placeholder="30"
                    min={1}
                    max={365}
                  />
                )}
              />
            </Form.Item>

            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setCreateModalVisible(false)}>
                  Cancel
                </Button>
                <Button type="primary" htmlType="submit" loading={isSubmitting}>
                  Create Token
                </Button>
              </Space>
            </div>
          </Form>
        </Modal>

        <Modal
          title="Token Created Successfully"
          open={!!createdToken}
          onCancel={() => setCreatedToken(null)}
          footer={[
            <Button key="copy" onClick={() => copyToClipboard(createdToken?.token || '')}>
              <CopyOutlined /> Copy Token
            </Button>,
            <Button key="use" type="primary" onClick={() => handleUseToken(createdToken?.token || '')}>
              Use This Token
            </Button>,
          ]}
        >
          <Alert
            message="Important: Save this token securely"
            description="This token will not be shown again. Make sure to copy it now."
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <div style={{ 
            background: '#f5f5f5', 
            padding: 12, 
            borderRadius: 6, 
            fontFamily: 'monospace',
            wordBreak: 'break-all',
            fontSize: 14
          }}>
            {createdToken?.visible ? createdToken.token : '••••••••••••••••••••••••••••••••'}
          </div>

          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Button
              type="link"
              icon={createdToken?.visible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              onClick={() => setCreatedToken(prev => prev ? { ...prev, visible: !prev.visible } : null)}
            >
              {createdToken?.visible ? 'Hide' : 'Show'} Token
            </Button>
          </div>
        </Modal>
      </Card>
    );
  }

  return (
    <Card 
      title="API Token Management"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateModalVisible(true)}
        >
          Create Token
        </Button>
      }
    >
      <Table
        columns={columns}
        dataSource={tokens}
        rowKey="_id"
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `Total ${total} tokens`,
        }}
      />

      <Modal
        title="Create API Token"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          reset();
        }}
        footer={null}
        width={600}
      >
        <Form layout="vertical" onFinish={handleSubmit(handleCreateToken)}>
          <Form.Item
            label="Token Name"
            help={errors.name?.message}
            validateStatus={errors.name ? 'error' : ''}
          >
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <Input {...field} placeholder="e.g., Production API Access" />
              )}
            />
          </Form.Item>

          <Form.Item
            label="Description (Optional)"
            help={errors.description?.message}
            validateStatus={errors.description ? 'error' : ''}
          >
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <TextArea {...field} rows={3} placeholder="Token description..." />
              )}
            />
          </Form.Item>

          <Form.Item
            label="Permissions"
            help={errors.permissions?.message}
            validateStatus={errors.permissions ? 'error' : ''}
          >
            <Controller
              name="permissions"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  mode="multiple"
                  placeholder="Select permissions"
                  options={[
                    { label: 'Read', value: 'read' },
                    { label: 'Write', value: 'write' },
                    { label: 'Admin', value: 'admin' },
                  ]}
                />
              )}
            />
          </Form.Item>

          <Form.Item
            label="Expires In (Days)"
            help={errors.expiresInDays?.message}
            validateStatus={errors.expiresInDays ? 'error' : ''}
          >
            <Controller
              name="expiresInDays"
              control={control}
              render={({ field }) => (
                <InputNumber
                  {...field}
                  style={{ width: '100%' }}
                  placeholder="30"
                  min={1}
                  max={365}
                />
              )}
            />
          </Form.Item>

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setCreateModalVisible(false)}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={isSubmitting}>
                Create Token
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      <Modal
        title="Token Created Successfully"
        open={!!createdToken}
        onCancel={() => setCreatedToken(null)}
        footer={[
          <Button key="copy" onClick={() => copyToClipboard(createdToken?.token || '')}>
            <CopyOutlined /> Copy Token
          </Button>,
          <Button key="use" type="primary" onClick={() => handleUseToken(createdToken?.token || '')}>
            Use This Token
          </Button>,
        ]}
      >
        <Alert
          message="Important: Save this token securely"
          description="This token will not be shown again. Make sure to copy it now."
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <div style={{ 
          background: '#f5f5f5', 
          padding: 12, 
          borderRadius: 6, 
          fontFamily: 'monospace',
          wordBreak: 'break-all',
          fontSize: 14
        }}>
          {createdToken?.visible ? createdToken.token : '••••••••••••••••••••••••••••••••'}
        </div>

        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <Button
            type="link"
            icon={createdToken?.visible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={() => setCreatedToken(prev => prev ? { ...prev, visible: !prev.visible } : null)}
          >
            {createdToken?.visible ? 'Hide' : 'Show'} Token
          </Button>
        </div>
      </Modal>
    </Card>
  );
};
*/
