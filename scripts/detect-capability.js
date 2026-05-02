'use strict';

/**
 * detectCapability — inspect environment flags and return a capability map.
 *
 * @param {object} opts
 * @param {boolean} [opts.is_git=false]             - Is the current directory a git repo?
 * @param {boolean} [opts.worktree_supported=false]  - Does git worktree work in this repo?
 * @param {boolean} [opts.team_env_set=false]        - Is the multi-agent runtime signal set?
 * @returns {{ git_worktree: boolean, team_mode_available: boolean, is_git: boolean }}
 */
function detectCapability({ is_git = false, worktree_supported = false, team_env_set = false } = {}) {
  return {
    git_worktree: is_git && worktree_supported,
    team_mode_available: team_env_set,
    is_git // capabilityToDisabled uses this to also disable 'new-branch' in non-git repos
  };
}

module.exports = { detectCapability };
