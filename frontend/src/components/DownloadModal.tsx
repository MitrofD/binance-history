import React, { useEffect } from 'react';

import {
  Modal,
  Form,
  DatePicker,
  Button,
  Space,
  Typography,
  Alert,
  Divider,
  Row,
  Col,
  Statistic,
} from 'antd';

import { CalendarOutlined, DownloadOutlined } from '@ant-design/icons';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import dayjs, { Dayjs } from 'dayjs';
import type { InferType } from 'yup';
import type { Timeframe } from '../types';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

interface DownloadModalProps {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (data: DownloadFormData) => void;
  symbol: string;
  timeframe: Timeframe;
}

interface DownloadFormData {
  symbol: string;
  timeframe: Timeframe;
  startDate: string;
  endDate: string;
}

// Validation schema
const schema = yup.object().shape({
  dateRange: yup
    .array()
    .of(yup.mixed<Dayjs>().required())
    .length(2, 'Please select both start and end dates')
    .required('Date range is required')
    .test('date-range', 'End date must be after start date', function (value) {
      if (!value || value.length !== 2) return false;
      const [start, end] = value as [Dayjs, Dayjs];
      return end.isAfter(start);
    })
    .test('max-range', 'Date range cannot exceed 1 year', function (value) {
      if (!value || value.length !== 2) return false;
      const [start, end] = value as [Dayjs, Dayjs];
      return end.diff(start, 'year') <= 1;
    })
    .test('future-date', 'End date cannot be in the future', function (value) {
      if (!value || value.length !== 2) return false;
      const [, end] = value as [Dayjs, Dayjs];
      return end.isBefore(dayjs()) || end.isSame(dayjs(), 'day');
    }),
});

type FormData = InferType<typeof schema>;

const DownloadModal: React.FC<DownloadModalProps> = ({
  visible,
  onCancel,
  onSubmit,
  symbol,
  timeframe,
}) => {
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      dateRange: [dayjs().subtract(30, 'day'), dayjs().subtract(1, 'day')],
    },
  });

  const dateRange = watch('dateRange');

  useEffect(() => {
    if (visible) {
      // Reset form when modal opens
      reset({
        dateRange: [dayjs().subtract(30, 'day'), dayjs().subtract(1, 'day')],
      });
    }
  }, [visible, reset]);

  const calculateEstimatedCandles = (
    start: Dayjs,
    end: Dayjs,
    timeframe: Timeframe,
  ): number => {
    const diffInMinutes = end.diff(start, 'minute');

    const timeframeMinutes: Record<Timeframe, number> = {
      '5m': 5,
      '15m': 15,
      '30m': 30,
      '1h': 60,
      '2h': 120,
      '4h': 240,
    };

    return Math.ceil(diffInMinutes / timeframeMinutes[timeframe]);
  };

  const calculateEstimatedSize = (candles: number): string => {
    // Approximate size per candle: ~150 bytes
    const sizeInBytes = candles * 150;

    if (sizeInBytes < 1024) return `${sizeInBytes} B`;
    if (sizeInBytes < 1024 * 1024)
      return `${(sizeInBytes / 1024).toFixed(1)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const onFormSubmit = (data: FormData) => {
    const [startDate, endDate] = data.dateRange;

    const submitData: DownloadFormData = {
      symbol,
      timeframe,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    onSubmit(submitData);
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const estimatedCandles =
    dateRange && dateRange.length === 2
      ? calculateEstimatedCandles(dateRange[0], dateRange[1], timeframe)
      : 0;

  const estimatedSize = calculateEstimatedSize(estimatedCandles);

  const presetRanges = [
    {
      label: 'Last 7 days',
      value: [dayjs().subtract(7, 'day'), dayjs().subtract(1, 'day')] as [
        Dayjs,
        Dayjs,
      ],
    },
    {
      label: 'Last 30 days',
      value: [dayjs().subtract(30, 'day'), dayjs().subtract(1, 'day')] as [
        Dayjs,
        Dayjs,
      ],
    },
    {
      label: 'Last 3 months',
      value: [dayjs().subtract(3, 'month'), dayjs().subtract(1, 'day')] as [
        Dayjs,
        Dayjs,
      ],
    },
    {
      label: 'Last 6 months',
      value: [dayjs().subtract(6, 'month'), dayjs().subtract(1, 'day')] as [
        Dayjs,
        Dayjs,
      ],
    },
    {
      label: 'Last year',
      value: [dayjs().subtract(1, 'year'), dayjs().subtract(1, 'day')] as [
        Dayjs,
        Dayjs,
      ],
    },
  ];

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DownloadOutlined />
          <span>Download Historical Data</span>
        </div>
      }
      open={visible}
      onCancel={handleCancel}
      width={600}
      footer={null}
    >
      <div style={{ marginBottom: 24 }}>
        <Alert
          message={`Downloading data for ${symbol} - ${timeframe.toUpperCase()}`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Row gutter={16}>
          <Col span={8}>
            <div
              style={{
                textAlign: 'center',
                padding: '12px 0',
                background: '#f5f5f5',
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600, color: '#1890ff' }}>
                {symbol}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>Symbol</div>
            </div>
          </Col>
          <Col span={8}>
            <div
              style={{
                textAlign: 'center',
                padding: '12px 0',
                background: '#f5f5f5',
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600, color: '#52c41a' }}>
                {timeframe.toUpperCase()}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>Timeframe</div>
            </div>
          </Col>
          <Col span={8}>
            <div
              style={{
                textAlign: 'center',
                padding: '12px 0',
                background: '#f5f5f5',
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600, color: '#722ed1' }}>
                {estimatedCandles.toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>Est. Candles</div>
            </div>
          </Col>
        </Row>
      </div>

      <Form layout="vertical" onFinish={handleSubmit(onFormSubmit)}>
        <Form.Item
          label="Date Range"
          help={errors.dateRange?.message}
          validateStatus={errors.dateRange ? 'error' : ''}
        >
          <Controller
            name="dateRange"
            control={control}
            render={({ field }) => (
              <RangePicker
                {...field}
                value={
                  (field.value?.length === 2 ? field.value : []) as [
                    Dayjs | null,
                    Dayjs | null,
                  ]
                }
                onChange={(val) => field.onChange([val?.[0], val?.[1]])}
                style={{ width: '100%' }}
                format="YYYY-MM-DD HH:mm"
                showTime={{ format: 'HH:mm' }}
                presets={presetRanges}
                disabledDate={(current) =>
                  current && current.isAfter(dayjs().endOf('day'))
                }
                placeholder={['Start Date', 'End Date']}
                size="large"
              />
            )}
          />
        </Form.Item>

        {dateRange && dateRange.length === 2 && (
          <div style={{ marginBottom: 24 }}>
            <Divider orientation="left">Download Estimation</Divider>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic
                  title="Estimated Candles"
                  value={estimatedCandles}
                  formatter={(value) => value?.toLocaleString()}
                />
              </Col>
              <Col span={8}>
                <Statistic title="Estimated Size" value={estimatedSize} />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Time Range"
                  value={`${dateRange[1].diff(dateRange[0], 'day')} days`}
                />
              </Col>
            </Row>
          </div>
        )}

        <Alert
          message="Important Notes"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>
                If data already exists for this period, it will be skipped
              </li>
              <li>Download will start from the last available data point</li>
              <li>Large date ranges may take several minutes to complete</li>
              <li>You can monitor progress in real-time on the main page</li>
            </ul>
          }
          type="warning"
          style={{ marginBottom: 24 }}
        />

        <div style={{ textAlign: 'right' }}>
          <Space>
            <Button onClick={handleCancel}>Cancel</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={isSubmitting}
              icon={<DownloadOutlined />}
              size="large"
            >
              Start Download
            </Button>
          </Space>
        </div>
      </Form>
    </Modal>
  );
};

export default DownloadModal;
