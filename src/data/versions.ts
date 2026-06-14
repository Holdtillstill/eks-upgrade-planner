export type EksVersion = {
  version: string;
  releaseDate: string;
  standardSupportEnd: string;
  extendedSupportEnd: string;
  latestPlatform?: string;
  sourceLabel: string;
  sourceUrl: string;
  notesUrl?: string;
  releaseUrl?: string;
};

export const dataFreshness = {
  checkedAt: '2026-06-04',
  note: 'Static client-side dataset checked against AWS lifecycle and platform-version docs for supported releases, with archived endoflife.date records for older expired releases. A scheduled GitHub workflow checks live sources daily and opens a PR when source data drifts.',
  verificationCadence: 'Daily scheduled source check; snapshot date changes only when source drift is committed. No-drift runs skip full app validation to conserve workflow minutes.',
  refreshSchedule: 'Daily at 09:23 UTC',
  refreshWorkflow: '.github/workflows/eks-data-refresh.yml',
  refreshWorkflowUrl: 'https://github.com/Holdtillstill/eks-upgrade-planner/actions/workflows/eks-data-refresh.yml',
  sourceLabel: 'AWS EKS Kubernetes version lifecycle',
  sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html',
};

export const eksVersions: EksVersion[] = [
  { version: '1.36', releaseDate: '2026-06-02', standardSupportEnd: '2027-08-02', extendedSupportEnd: '2028-08-02', latestPlatform: '1.36-eks-3', sourceLabel: 'AWS EKS Kubernetes version lifecycle', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html', notesUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions-standard.html#kubernetes-1-36', releaseUrl: 'https://aws.amazon.com/about-aws/whats-new/2026/06/amazon-eks-distro-kubernetes-version-1-36/' },
  { version: '1.35', releaseDate: '2026-01-27', standardSupportEnd: '2027-03-27', extendedSupportEnd: '2028-03-27', latestPlatform: '1.35-eks-13', sourceLabel: 'AWS EKS Kubernetes version lifecycle', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html', notesUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions-standard.html#kubernetes-1-35', releaseUrl: 'https://aws.amazon.com/about-aws/whats-new/2026/01/amazon-eks-distro-kubernetes-version-1-35/' },
  { version: '1.34', releaseDate: '2025-10-02', standardSupportEnd: '2026-12-02', extendedSupportEnd: '2027-12-02', latestPlatform: '1.34-eks-23', sourceLabel: 'AWS EKS Kubernetes version lifecycle', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html', notesUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions-standard.html#kubernetes-1-34', releaseUrl: 'https://aws.amazon.com/about-aws/whats-new/2025/10/amazon-eks-distro-kubernetes-version-1-34/' },
  { version: '1.33', releaseDate: '2025-05-29', standardSupportEnd: '2026-07-29', extendedSupportEnd: '2027-07-29', latestPlatform: '1.33-eks-37', sourceLabel: 'AWS EKS Kubernetes version lifecycle', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html', notesUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions-standard.html#kubernetes-1-33', releaseUrl: 'https://aws.amazon.com/about-aws/whats-new/2025/05/amazon-eks-distro-kubernetes-version-1-33/' },
  { version: '1.32', releaseDate: '2025-01-23', standardSupportEnd: '2026-03-23', extendedSupportEnd: '2027-03-23', latestPlatform: '1.32-eks-44', sourceLabel: 'AWS EKS Kubernetes version lifecycle', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html', notesUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions-extended.html#kubernetes-1-32', releaseUrl: 'https://aws.amazon.com/about-aws/whats-new/2025/01/amazon-eks-eks-distro-kubernetes-version-1-32/' },
  { version: '1.31', releaseDate: '2024-09-26', standardSupportEnd: '2025-11-26', extendedSupportEnd: '2026-11-26', latestPlatform: '1.31-eks-60', sourceLabel: 'AWS EKS Kubernetes version lifecycle', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html', notesUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions-extended.html#kubernetes-1-31', releaseUrl: 'https://aws.amazon.com/about-aws/whats-new/2024/09/amazon-eks-distro-kubernetes-version-1-31/' },
  { version: '1.30', releaseDate: '2024-05-23', standardSupportEnd: '2025-07-23', extendedSupportEnd: '2026-07-23', latestPlatform: '1.30-eks-68', sourceLabel: 'AWS EKS Kubernetes version lifecycle', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html', notesUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions-extended.html#kubernetes-1-30', releaseUrl: 'https://aws.amazon.com/about-aws/whats-new/2024/05/amazon-eks-distro-kubernetes-version-1-30/' },
  { version: '1.29', releaseDate: '2024-01-23', standardSupportEnd: '2025-03-23', extendedSupportEnd: '2026-03-23', latestPlatform: '1.29-eks-66', sourceLabel: 'endoflife.date Amazon EKS lifecycle archive', sourceUrl: 'https://endoflife.date/amazon-eks' },
  { version: '1.28', releaseDate: '2023-09-26', standardSupportEnd: '2024-11-26', extendedSupportEnd: '2025-11-26', latestPlatform: '1.28-eks-63', sourceLabel: 'endoflife.date Amazon EKS lifecycle archive', sourceUrl: 'https://endoflife.date/amazon-eks' },
];
