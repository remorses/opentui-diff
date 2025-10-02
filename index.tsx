import { TextAttributes } from "@opentui/core";
import { structuredPatch } from "diff";
import { render } from "@opentui/react";

import { StructuredPatchHunk as Hunk, diffWordsWithSpace } from "diff";
import * as React from "react";

export const FileEditPreviewTitle = ({
  filePath,
  hunks,
}: {
  filePath: string;
  hunks: Hunk[];
}) => {
  const numAdditions = hunks.reduce(
    (count, hunk) => count + hunk.lines.filter((_) => _.startsWith("+")).length,
    0,
  );
  const numRemovals = hunks.reduce(
    (count, hunk) => count + hunk.lines.filter((_) => _.startsWith("-")).length,
    0,
  );

  return (
    <Text>
      Updated <Text bold>{filePath}</Text>
      {numAdditions > 0 || numRemovals > 0 ? " with " : ""}
      {numAdditions > 0 ? (
        <>
          <Text bold>{numAdditions}</Text>{" "}
          {numAdditions > 1 ? "additions" : "addition"}
        </>
      ) : null}
      {numAdditions > 0 && numRemovals > 0 ? " and " : null}
      {numRemovals > 0 ? (
        <>
          <Text bold>{numRemovals}</Text>{" "}
          {numRemovals > 1 ? "removals" : "removal"}
        </>
      ) : null}
    </Text>
  );
};

export const FileEditPreview = ({
  hunks,
  paddingLeft = 0,
}: {
  hunks: Hunk[];
  paddingLeft?: number;
}) => {
  return (
    <Box flexDirection="column">
      {hunks.flatMap((patch, i) => {
        const elements = [
          <Box
            flexDirection="column"
            paddingLeft={paddingLeft}
            key={patch.newStart}
          >
            <StructuredDiff patch={patch} />
          </Box>,
        ];
        if (i < hunks.length - 1) {
          elements.push(
            <Box paddingLeft={paddingLeft} key={`ellipsis-${i}`}>
              <Text color="secondaryText">...</Text>
            </Box>,
          );
        }
        return elements;
      })}
    </Box>
  );
};

// Simple React components to replace Ink's Box and Text
const Box = ({
  children,
  flexDirection = "row" as "row" | "column",
  paddingLeft = 0,
  ...props
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection,
        paddingLeft: `${paddingLeft * 0.5}rem`,
      }}
      {...props}
    >
      {children}
    </div>
  );
};

const Text = ({
  children,
  color,
  backgroundColor,
  bold,
  type,
  ...props
}: {
  children?: React.ReactNode;
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  type?: string;
  [key: string]: any;
}) => {
  const style: React.CSSProperties = {};

  // Use Tailwind's default color tokens
  if (color === "error") style.color = "var(--color-red-500)";
  if (color === "secondaryText") style.color = "var(--color-neutral-500)";

  if (backgroundColor) {
    // Use Tailwind color tokens with opacity via oklch
    const bgColors = {
      added: "oklch(from var(--color-green-500) l c h / 20%)",
      addedLight: "oklch(from var(--color-green-500) l c h / 10%)",
      removed: "oklch(from var(--color-red-500) l c h / 20%)",
      removedLight: "oklch(from var(--color-red-500) l c h / 10%)",
    };
    style.backgroundColor = bgColors[backgroundColor];
  }

  if (bold) style.fontWeight = "bold";

  return (
    <span style={style} {...props}>
      {children}
    </span>
  );
};

// Utility functions
const wrapText = (text: string, width: number): string[] => {
  if (text.length <= width) return [text];
  const lines: string[] = [];
  let currentLine = "";

  for (const char of text) {
    if (currentLine.length >= width) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine += char;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
};

// Helper function to get word-level diff
const getWordDiff = (oldLine: string, newLine: string) => {
  return diffWordsWithSpace(oldLine, newLine);
};

// StructuredDiff component
const StructuredDiff = ({ patch }: { patch: Hunk }) => {
  const formatDiff = (lines: string[], startingLineNumber: number) => {
    const processedLines = lines.map((code) => {
      if (code.startsWith("+")) {
        return { code: " " + code.slice(1), type: "add", originalCode: code };
      }
      if (code.startsWith("-")) {
        return {
          code: " " + code.slice(1),
          type: "remove",
          originalCode: code,
        };
      }
      return { code, type: "nochange", originalCode: code };
    });

    // Find pairs of removed/added lines for word-level diff
    const linePairs: Array<{ remove?: number; add?: number }> = [];
    for (let i = 0; i < processedLines.length; i++) {
      if (processedLines[i].type === "remove") {
        // Look ahead for corresponding add
        let j = i + 1;
        while (
          j < processedLines.length &&
          processedLines[j].type === "remove"
        ) {
          j++;
        }
        if (j < processedLines.length && processedLines[j].type === "add") {
          linePairs.push({ remove: i, add: j });
        }
      }
    }

    let lineNumber = startingLineNumber;
    const result: Array<{
      code: React.ReactNode;
      type: string;
      lineNumber: number;
    }> = [];

    for (let i = 0; i < processedLines.length; i++) {
      const { code, type, originalCode } = processedLines[i];

      // Check if this line is part of a word-diff pair
      const pair = linePairs.find((p) => p.remove === i || p.add === i);

      if (pair && pair.remove === i && pair.add !== undefined) {
        // This is a removed line with a corresponding added line
        const removedText = processedLines[i].code;
        const addedText = processedLines[pair.add].code;
        const wordDiff = getWordDiff(removedText, addedText);

        // Create word-level diff display for removed line
        const removedContent = (
          <Text backgroundColor="removedLight">
            <Text>-</Text>
            {wordDiff.map((part, idx) => {
              if (part.removed) {
                return (
                  <Text key={`removed-${i}-${idx}`} backgroundColor="removed">
                    {part.value}
                  </Text>
                );
              }
              return <Text key={`unchanged-${i}-${idx}`}>{part.value}</Text>;
            })}
          </Text>
        );

        result.push({ code: removedContent, type, lineNumber });
      } else if (pair && pair.add === i && pair.remove !== undefined) {
        // This is an added line with a corresponding removed line
        const removedText = processedLines[pair.remove].code;
        const addedText = processedLines[i].code;
        const wordDiff = getWordDiff(removedText, addedText);

        // Create word-level diff display for added line
        const addedContent = (
          <Text backgroundColor="addedLight">
            <Text>+</Text>
            {wordDiff.map((part, idx) => {
              if (part.added) {
                return (
                  <Text key={`added-${i}-${idx}`} backgroundColor="added">
                    {part.value}
                  </Text>
                );
              }
              return <Text key={`unchanged-${i}-${idx}`}>{part.value}</Text>;
            })}
          </Text>
        );

        result.push({ code: addedContent, type, lineNumber });
      } else {
        // Regular line without word-level diff
        const content =
          type === "add" || type === "remove" ? (
            <Text
              backgroundColor={type === "add" ? "addedLight" : "removedLight"}
            >
              <Text>{type === "add" ? "+" : "-"}</Text>
              {code}
            </Text>
          ) : (
            <> {code}</>
          );

        result.push({ code: content, type, lineNumber });
      }

      if (type === "nochange" || type === "add") {
        lineNumber++;
      }
    }

    const maxLineNumber = Math.max(...result.map((r) => r.lineNumber));
    const maxWidth = maxLineNumber.toString().length;

    return result.map(({ type, code, lineNumber }, index) => {
      const lineNumberText = lineNumber.toString().padStart(maxWidth);

      return (
        <Text key={`line-${index}`}>
          <Text color="secondaryText">{lineNumberText} </Text>
          {code}
        </Text>
      );
    });
  };

  const diff = formatDiff(patch.lines, patch.oldStart);
  return (
    <>
      {diff.map((line, i) => (
        <Box key={i}>{line}</Box>
      ))}
    </>
  );
};






// Example file content before and after
const beforeContent = `import React from 'react'
import PropTypes from 'prop-types'
import { cn } from '../utils/cn'

function Button({ variant = "primary", className, ...props }) {
  return (
    <button
      className={cn(
        "px-4 py-2 rounded",
        variant === "primary" && "bg-blue-500 text-white",
        className
      )}
      {...props}
    />
  )
}

export default Button

Button.propTypes = {
  variant: PropTypes.oneOf(["primary"]),
  className: PropTypes.string,
}`;

const afterContent = `import React from 'react'
import PropTypes from 'prop-types'
import { cn } from '../utils/cn'

function Button({ variant = "primary", className, ...props }) {
  return (
    <button
      className={cn(
        "px-4 py-2 rounded-lg transition-colors",
        variant === "primary" && "bg-blue-500 text-white hover:bg-blue-600",
        variant === "secondary" && "bg-neutral-200 text-neutral-800 hover:bg-neutral-300",
        className
      )}
      {...props}
    />
  )
}

export default Button

Button.propTypes = {
  variant: PropTypes.oneOf(["primary", "secondary"]),
  className: PropTypes.string,
}`;

// Generate patch from before/after content
const filePath = "/src/components/Button.tsx";
const hunks = structuredPatch(
  filePath,
  filePath,
  beforeContent,
  afterContent,
  undefined,
  undefined,
  { context: 3, ignoreWhitespace: true, stripTrailingCr: true },
).hunks;

function App() {
  return (
    <div className="min-h-screen bg-black text-neutral-100 p-8">
      <pre className="mt-8 bg-neutral-900 whitespace-pre-wrap rounded-lg p-4 font-mono text-sm">
        <FileEditPreviewTitle filePath={filePath} hunks={hunks} />
        <FileEditPreview hunks={hunks} paddingLeft={0} />
      </pre>
    </div>
  );
}

render(<App />);
