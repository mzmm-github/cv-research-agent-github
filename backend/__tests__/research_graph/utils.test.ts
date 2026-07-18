import {
  buildFallbackAblationConfig,
  extractGeneratedFiles,
  routeResearchTask,
} from '../../src/research_graph/utils.js';

describe('research workflow utilities', () => {
  it('honors an explicit workflow mode', () => {
    expect(routeResearchTask('analyze anything', 'qa')).toBe('qa');
  });

  it('routes experiment analysis requests', () => {
    expect(routeResearchTask('分析训练日志中的 loss 和 mAP50 收敛趋势')).toBe(
      'analysis',
    );
  });

  it('routes ablation planning requests', () => {
    expect(routeResearchTask('生成注意力模块的消融实验 YAML 配置')).toBe(
      'ablation',
    );
  });

  it('extracts downloadable configuration blocks', () => {
    const files = extractGeneratedFiles(
      'Plan\n```yaml\nexperiment:\n  name: test\n```',
    );
    expect(files).toEqual([
      {
        filename: 'ablation_plan.yaml',
        language: 'yaml',
        content: 'experiment:\n  name: test',
      },
    ]);
  });

  it('creates a conservative fallback configuration', () => {
    const config = buildFallbackAblationConfig('test a new detection head');
    expect(config).toContain('name: cv_ablation_study');
    expect(config).toContain('seeds: [17, 29, 43]');
    expect(config).toContain('primary_metric: mAP50_95');
  });
});
