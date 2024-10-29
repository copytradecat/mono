
export interface Settings {
  slippage: number;
  slippageType: 'fixed' | 'dynamic';
  smartMevProtection: 'fast' | 'secure' | null;
  transactionSpeed: 'medium' | 'high' | 'veryHigh' | 'custom' | 'auto';
  priorityFee: number | 'auto' | null;
  entryAmounts: number[];
  exitPercentages: number[];
  wrapUnwrapSOL: boolean;
}

export const defaultSettings: Settings = {
  slippage: 300, // 3%
  slippageType: 'dynamic',
  smartMevProtection: 'secure',
  transactionSpeed: 'medium',
  priorityFee: 'auto',
  entryAmounts: [0.000101, 0.000202, 0.000303, 0.000404, 0.000505],
  exitPercentages: [10, 20, 50, 75, 100],
  wrapUnwrapSOL: true,
};
