export const eksPricing = {
  currency: 'USD',
  hoursPerMonth: 730, // AWS monthly planning convention: 365 days x 24 hours / 12 months.
  standardPerClusterHour: 0.10,
  extendedPerClusterHour: 0.60,
  sourceLabel: 'Amazon EKS pricing',
  sourceUrl: 'https://aws.amazon.com/eks/pricing/',
  note: 'Control-plane support tier pricing only. Worker nodes, Fargate, EBS, data transfer, IPv4, and add-on costs are not included.',
};
