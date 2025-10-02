import { TextAttributes } from "@opentui/core";
import { structuredPatch } from "diff";
import { render } from "@opentui/react";
import * as React from "react";

import { type StructuredPatchHunk as Hunk, diffWordsWithSpace } from "diff";

// Custom error boundary class
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };

    // Bind methods
    this.componentDidCatch = this.componentDidCatch.bind(this);
  }

  static getDerivedStateFromError(error: Error): {
    hasError: boolean;
    error: Error;
  } {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("Error caught by boundary:", error);
    console.error("Component stack:", errorInfo.componentStack);

    // Copy stack trace to clipboard
    const stackTrace = `${error.message}\n\nStack trace:\n${error.stack}\n\nComponent stack:\n${errorInfo.componentStack}`;
    const { execSync } = require("child_process");
    try {
      execSync("pbcopy", { input: stackTrace });
      console.log("Stack trace copied to clipboard");
    } catch (copyError) {
      console.error("Failed to copy to clipboard:", copyError);
    }
  }

  override render(): any {
    if (this.state.hasError && this.state.error) {
      return (
        <box style={{ flexDirection: "column", padding: 2 }}>
          <text fg="red">
            <strong>Error occurred:</strong>
          </text>
          <text>{this.state.error.message}</text>
          <text fg="brightBlack">Stack trace (copied to clipboard):</text>
          <text fg="white">{this.state.error.stack}</text>
        </box>
      );
    }

    return this.props.children;
  }
}

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
    <text>
      Updated <strong>{filePath}</strong>
      {numAdditions > 0 || numRemovals > 0 ? " with " : ""}
      {numAdditions > 0 ? (
        <>
          <strong>{numAdditions}</strong>{" "}
          {numAdditions > 1 ? "additions" : "addition"}
        </>
      ) : null}
      {numAdditions > 0 && numRemovals > 0 ? " and " : null}
      {numRemovals > 0 ? (
        <>
          <strong>{numRemovals}</strong>{" "}
          {numRemovals > 1 ? "removals" : "removal"}
        </>
      ) : null}
    </text>
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
    <box style={{ flexDirection: "column" }}>
      {hunks.flatMap((patch, i) => {
        const elements = [
          <box
            style={{ flexDirection: "column", paddingLeft }}
            key={patch.newStart}
          >
            <StructuredDiff patch={patch} />
          </box>,
        ];
        if (i < hunks.length - 1) {
          elements.push(
            <box style={{ paddingLeft }} key={`ellipsis-${i}`}>
              <text fg="brightBlack">...</text>
            </box>,
          );
        }
        return elements;
      })}
    </box>
  );
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
      if (processedLines[i]?.type === "remove") {
        // Look ahead for corresponding add
        let j = i + 1;
        while (
          j < processedLines.length &&
          processedLines[j]?.type === "remove"
        ) {
          j++;
        }
        if (j < processedLines.length && processedLines[j]?.type === "add") {
          linePairs.push({ remove: i, add: j });
        }
      }
    }

    let lineNumber = startingLineNumber;
    const result: Array<{
      code: any;
      type: string;
      lineNumber: number;
    }> = [];

    for (let i = 0; i < processedLines.length; i++) {
      const processedLine = processedLines[i];
      if (!processedLine) continue;

      const { code, type, originalCode } = processedLine;

      // Check if this line is part of a word-diff pair
      const pair = linePairs.find((p) => p.remove === i || p.add === i);

      if (pair && pair.remove === i && pair.add !== undefined) {
        // This is a removed line with a corresponding added line
        const removedText = processedLines[i]?.code;
        const addedLine = processedLines[pair.add];
        if (!removedText || !addedLine) continue;

        const addedText = addedLine.code;
        const wordDiff = getWordDiff(removedText, addedText);

        // Create word-level diff display for removed line
        const removedContent = (
          <text bg="red">
            <span fg="brightRed">-</span>
            {wordDiff.map((part, idx) => {
              if (part.removed) {
                return <span key={`removed-${i}-${idx}`} fg="white" bg="red">{part.value}</span>;
              }
              return part.value;
            })}
          </text>
        );

        result.push({ code: removedContent, type, lineNumber });
      } else if (pair && pair.add === i && pair.remove !== undefined) {
        // This is an added line with a corresponding removed line
        const removedLine = processedLines[pair.remove];
        const addedLine = processedLines[i];
        if (!removedLine || !addedLine) continue;

        const removedText = removedLine.code;
        const addedText = addedLine.code;
        const wordDiff = getWordDiff(removedText, addedText);

        // Create word-level diff display for added line
        const addedContent = (
          <text bg="green">
            <span fg="brightGreen">+</span>
            {wordDiff.map((part, idx) => {
              if (part.added) {
                return <span key={`added-${i}-${idx}`} fg="white" bg="green">{part.value}</span>;
              }
              return part.value;
            })}
          </text>
        );

        result.push({ code: addedContent, type, lineNumber });
      } else {
        // Regular line without word-level diff
        const content =
          type === "add" || type === "remove" ? (
            <text bg={type === "add" ? "green" : "red"}>
              <span fg={type === "add" ? "brightGreen" : "brightRed"}>
                {type === "add" ? "+" : "-"}
              </span>
              {code}
            </text>
          ) : (
            <text> {code}</text>
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

      return {
        lineNumber: lineNumberText,
        code,
        key: `line-${index}`,
      };
    });
  };

  const diff = formatDiff(patch.lines, patch.oldStart);
  return (
    <>
      {diff.map(({ lineNumber, code, key }) => (
        <box key={key} style={{ flexDirection: "row" }}>
          <text fg="brightBlack">{lineNumber} </text>
          {code}
        </box>
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
    <box style={{ flexDirection: "column", padding: 2 }}>
      <FileEditPreviewTitle filePath={filePath} hunks={hunks} />
      <FileEditPreview hunks={hunks} paddingLeft={0} />
    </box>
  );
}

await render(
  React.createElement(ErrorBoundary, null, React.createElement(App)),
);
