import { Composition, Folder } from "remotion";
import { PlaceholderComp, placeholderCalculateMetadata } from "./compositions/Placeholder.js";

/**
 * The Root component registers every composition the studio knows about.
 *
 * The agent writes new compositions into src/compositions/<product>/ at generate time
 * and adds them to a per-product <Folder> block in this file.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="_examples">
        <Composition
          id="placeholder-linkedin"
          component={PlaceholderComp}
          durationInFrames={150}
          fps={30}
          width={1080}
          height={1080}
          defaultProps={{ title: "Video Studio", subtitle: "Ready for a script", format: "linkedin" as const }}
          calculateMetadata={placeholderCalculateMetadata}
        />
        <Composition
          id="placeholder-x"
          component={PlaceholderComp}
          durationInFrames={150}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{ title: "Video Studio", subtitle: "Ready for a script", format: "x" as const }}
          calculateMetadata={placeholderCalculateMetadata}
        />
      </Folder>
    </>
  );
};
