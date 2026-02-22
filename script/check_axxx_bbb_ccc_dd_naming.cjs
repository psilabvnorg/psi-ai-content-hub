#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync } = require("node:child_process");
const { extname } = require("node:path");

const a_naming_regex_rule = /^a[a-z0-9]*(?:_[a-z0-9]+){3,}$/;
const a_checked_extension_set = new Set([".py", ".ts", ".tsx", ".js", ".cjs", ".mjs"]);

const a_declaration_matcher_list = [
  /^\+def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
  /^\+class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(|:)/,
  /^\+(?:export\s+)?(?:const|let|var|function|type|interface|class)\s+([A-Za-z_][A-Za-z0-9_]*)\b/,
];

const a_run_git_command_data = (args) => {
  const a_result_data = spawnSync("git", args, { encoding: "utf8" });
  if (a_result_data.status !== 0) {
    throw new Error(a_result_data.stderr || a_result_data.stdout || `git ${args.join(" ")} failed`);
  }
  return a_result_data.stdout;
};

const a_collect_changed_file_list_data = () => {
  const a_output_data = a_run_git_command_data(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]);
  return a_output_data
    .split(/\r?\n/)
    .map((a_line_data) => a_line_data.trim())
    .filter(Boolean)
    .filter((a_file_path_data) => a_checked_extension_set.has(extname(a_file_path_data)));
};

const a_collect_added_line_list_data = (a_file_path_data) => {
  const a_diff_data = a_run_git_command_data(["diff", "--unified=0", "--no-color", "HEAD", "--", a_file_path_data]);
  return a_diff_data
    .split(/\r?\n/)
    .filter((a_line_data) => a_line_data.startsWith("+") && !a_line_data.startsWith("+++"));
};

const a_extract_identifier_list_data = (a_added_line_list_data) => {
  const a_identifier_payload_list_data = [];
  for (const a_line_data of a_added_line_list_data) {
    for (const a_matcher_data of a_declaration_matcher_list) {
      const a_match_data = a_line_data.match(a_matcher_data);
      if (a_match_data?.[1]) {
        a_identifier_payload_list_data.push({ a_identifier_data: a_match_data[1], a_line_data });
      }
    }
  }
  return a_identifier_payload_list_data;
};

const a_main_data = () => {
  const a_changed_file_list_data = a_collect_changed_file_list_data();
  if (a_changed_file_list_data.length === 0) {
    console.log("check:naming: no changed tracked files to validate.");
    return;
  }

  const a_violation_list_data = [];

  for (const a_file_path_data of a_changed_file_list_data) {
    const a_added_line_list_data = a_collect_added_line_list_data(a_file_path_data);
    const a_identifier_payload_list_data = a_extract_identifier_list_data(a_added_line_list_data);
    for (const a_payload_data of a_identifier_payload_list_data) {
      if (!a_naming_regex_rule.test(a_payload_data.a_identifier_data)) {
        a_violation_list_data.push({
          a_file_path_data,
          a_identifier_data: a_payload_data.a_identifier_data,
          a_line_data: a_payload_data.a_line_data,
        });
      }
    }
  }

  if (a_violation_list_data.length > 0) {
    console.error("check:naming: naming violations detected (expected axxx_bbb_ccc_dd style).");
    for (const a_violation_data of a_violation_list_data) {
      console.error(
        `- ${a_violation_data.a_file_path_data}: '${a_violation_data.a_identifier_data}' from line '${a_violation_data.a_line_data.trim()}'`
      );
    }
    process.exit(1);
  }

  console.log("check:naming: passed.");
};

try {
  a_main_data();
} catch (a_error_data) {
  const a_message_data = a_error_data instanceof Error ? a_error_data.message : String(a_error_data);
  console.error(`check:naming: failed to run (${a_message_data})`);
  process.exit(1);
}
