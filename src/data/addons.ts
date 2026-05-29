export type Addon = {
  id: string;
  name: string;
  type: 'AWS managed' | 'Platform addon';
  whyItMatters: string;
  sourceLabel: string;
  sourceUrl: string;
  checks: string[];
};

export const addons: Addon[] = [
  { id: 'vpc-cni', name: 'Amazon VPC CNI', type: 'AWS managed', whyItMatters: 'Pod networking and IP allocation behavior can change across EKS releases.', sourceLabel: 'Amazon VPC CNI add-on docs', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/eks-add-ons.html', checks: ['aws eks describe-addon --cluster-name $CLUSTER --addon-name vpc-cni', 'aws eks describe-addon-versions --addon-name vpc-cni --kubernetes-version $TARGET'] },
  { id: 'coredns', name: 'CoreDNS', type: 'AWS managed', whyItMatters: 'DNS failures after upgrades are high-impact and often tied to stale managed add-on versions.', sourceLabel: 'Amazon EKS CoreDNS add-on docs', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/managing-coredns.html', checks: ['kubectl -n kube-system get deployment coredns -o wide', 'kubectl -n kube-system rollout status deploy/coredns'] },
  { id: 'kube-proxy', name: 'kube-proxy', type: 'AWS managed', whyItMatters: 'Should generally track the cluster minor version to avoid networking edge cases.', sourceLabel: 'Amazon EKS kube-proxy add-on', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/managing-kube-proxy.html', checks: ['kubectl -n kube-system get daemonset kube-proxy -o wide'] },
  { id: 'ebs-csi', name: 'Amazon EBS CSI Driver', type: 'AWS managed', whyItMatters: 'Storage attach/mount behavior is a critical preflight validation point.', sourceLabel: 'Amazon EBS CSI driver on EKS', sourceUrl: 'https://docs.aws.amazon.com/eks/latest/userguide/ebs-csi.html', checks: ['aws eks describe-addon --cluster-name $CLUSTER --addon-name aws-ebs-csi-driver'] },
  { id: 'aws-load-balancer-controller', name: 'AWS Load Balancer Controller', type: 'Platform addon', whyItMatters: 'Ingress/Service reconciliation, webhook certs, and IAM permissions can block workloads after upgrades.', sourceLabel: 'AWS Load Balancer Controller docs', sourceUrl: 'https://kubernetes-sigs.github.io/aws-load-balancer-controller/', checks: ['helm -n kube-system list | grep aws-load-balancer-controller', 'kubectl -n kube-system logs deploy/aws-load-balancer-controller --tail=100'] },
  { id: 'karpenter', name: 'Karpenter', type: 'Platform addon', whyItMatters: 'Node provisioning APIs and disruption settings can change quickly; verify release notes before cluster upgrades.', sourceLabel: 'Karpenter documentation', sourceUrl: 'https://karpenter.sh/docs/', checks: ['kubectl get nodepools,nodeclaims,ec2nodeclasses -A', 'helm -n karpenter list'] },
  { id: 'cert-manager', name: 'cert-manager', type: 'Platform addon', whyItMatters: 'CRDs and admission webhooks must be healthy before and after control-plane upgrades.', sourceLabel: 'cert-manager supported releases', sourceUrl: 'https://cert-manager.io/docs/releases/', checks: ['kubectl get crd | grep cert-manager.io', 'kubectl -n cert-manager get pods'] },
  { id: 'ingress-nginx', name: 'ingress-nginx', type: 'Platform addon', whyItMatters: 'Ingress API and controller admission webhooks are common upgrade blockers.', sourceLabel: 'ingress-nginx releases', sourceUrl: 'https://github.com/kubernetes/ingress-nginx/releases', checks: ['helm -n ingress-nginx list', 'kubectl -n ingress-nginx get pods -o wide'] },
  { id: 'argo-cd', name: 'Argo CD', type: 'Platform addon', whyItMatters: 'GitOps controllers surface deprecated APIs and sync failures during upgrades.', sourceLabel: 'Argo CD releases', sourceUrl: 'https://github.com/argoproj/argo-cd/releases', checks: ['argocd app list', 'kubectl -n argocd get pods'] },
  { id: 'kube-prometheus-stack', name: 'kube-prometheus-stack', type: 'Platform addon', whyItMatters: 'CRDs for Prometheus/Alertmanager/Grafana dashboards should be upgraded intentionally.', sourceLabel: 'kube-prometheus-stack chart', sourceUrl: 'https://artifacthub.io/packages/helm/prometheus-community/kube-prometheus-stack', checks: ['helm -n monitoring list', 'kubectl get crd | grep monitoring.coreos.com'] },
];
