import { WorkbenchRoute } from "./Workbench.js";

/**
 * Playground — workbench surface NOT anchored to a source project.
 *
 * Same chat composer, same scaffold, same artifact panel, same persona /
 * model / video-type pickers. The only difference is the projectId: we
 * pin it to the synthetic id `__playground__` so:
 *
 *   - sessions persist under <userData>/sessions/__playground__/<id>.json
 *   - the agent's run uses <workspace>/__playground__/ for everything
 *   - SessionSidebar lists every playground session you've ever started
 *
 * The agent's Stage 1 ("read source") gracefully no-ops when the projectId
 * is __playground__ — there's no organisation-projects/__playground__/ to
 * read from. The brief becomes the only context the agent has, which is
 * exactly the playground vibe: pure prompt → video.
 */
export function PlaygroundRoute() {
  return <WorkbenchRoute projectIdOverride="__playground__" variant="playground" />;
}
