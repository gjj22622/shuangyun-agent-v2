import type { MasterCase, Playbook } from "@shuangyun/shared-types";

export type MasterBrainTaskAttrs = {
  industry?: string;
  channel?: string;
  tags?: string[];
};

export type MasterBrain = {
  recallCases: (taskAttrs: MasterBrainTaskAttrs, limit?: number) => MasterCase[];
  recallPlaybooks: (taskAttrs: MasterBrainTaskAttrs, limit?: number) => Playbook[];
};

type MasterBrainRepositories = {
  masterCases: {
    listAll: () => MasterCase[];
    listByIndustry: (industry: string) => MasterCase[];
    listByTags: (tags: string[], limit?: number) => MasterCase[];
  };
  playbooks: {
    findApplicable: (taskAttrs: Record<string, string | string[]>) => Playbook[];
  };
};

type ScoredCase = {
  masterCase: MasterCase;
  score: number;
};

function calculateCaseScore(masterCase: MasterCase, taskAttrs: MasterBrainTaskAttrs): number {
  let score = 0;

  if (taskAttrs.industry && masterCase.industry === taskAttrs.industry) {
    score += 1;
  }

  if (taskAttrs.channel && masterCase.channel === taskAttrs.channel) {
    score += 1;
  }

  if (taskAttrs.tags && taskAttrs.tags.length > 0) {
    const matchedTags = taskAttrs.tags.filter((tag) => masterCase.tags.includes(tag));
    score += matchedTags.length;
  }

  return score;
}

function sortScoredCases(left: ScoredCase, right: ScoredCase): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  return right.masterCase.createdAt.localeCompare(left.masterCase.createdAt);
}

function toPlaybookAttrs(taskAttrs: MasterBrainTaskAttrs): Record<string, string | string[]> {
  const attrs: Record<string, string | string[]> = {};

  if (taskAttrs.industry) {
    attrs.industry = taskAttrs.industry;
  }

  if (taskAttrs.channel) {
    attrs.channel = taskAttrs.channel;
  }

  if (taskAttrs.tags && taskAttrs.tags.length > 0) {
    attrs.tags = taskAttrs.tags;
  }

  return attrs;
}

export function loadMasterBrain(repositories: MasterBrainRepositories): MasterBrain {
  return {
    recallCases(taskAttrs, limit = 5) {
      const candidateMap = new Map<string, MasterCase>();

      for (const masterCase of repositories.masterCases.listAll()) {
        candidateMap.set(masterCase.caseId, masterCase);
      }

      if (taskAttrs.industry) {
        for (const masterCase of repositories.masterCases.listByIndustry(taskAttrs.industry)) {
          candidateMap.set(masterCase.caseId, masterCase);
        }
      }

      if (taskAttrs.tags && taskAttrs.tags.length > 0) {
        for (const masterCase of repositories.masterCases.listByTags(taskAttrs.tags, Math.max(limit * 3, 20))) {
          candidateMap.set(masterCase.caseId, masterCase);
        }
      }

      return Array.from(candidateMap.values())
        .map((masterCase) => ({
          masterCase,
          score: calculateCaseScore(masterCase, taskAttrs)
        }))
        .filter((entry) => entry.score > 0)
        .sort(sortScoredCases)
        .slice(0, limit)
        .map((entry) => entry.masterCase);
    },
    recallPlaybooks(taskAttrs, limit = 3) {
      return repositories.playbooks.findApplicable(toPlaybookAttrs(taskAttrs)).slice(0, limit);
    }
  };
}

export function createNoopMasterBrain(): MasterBrain {
  return {
    recallCases: () => [],
    recallPlaybooks: () => []
  };
}
