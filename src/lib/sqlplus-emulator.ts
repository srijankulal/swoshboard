/**
 * Oracle SQL*Plus terminal emulation and table formatter.
 * Produces authentic SQL*Plus ASCII table layout and DDL/DML feedback
 * suitable for university DBMS lab manuals and execution.
 */

export interface SqlPlusResult {
  raw: string;
  formatted: string;
  isError: boolean;
  rowsCount?: number;
}

export function formatSqlPlusTable(columns: string[], rows: (string | number | null | undefined)[][]): string {
  if (columns.length === 0) {
    return "no rows selected";
  }
  if (rows.length === 0) {
    const colHeader = columns.map((c) => c.toUpperCase()).join(" ");
    const colUnderline = columns.map((c) => "-".repeat(Math.max(c.length, 4))).join(" ");
    return `${colHeader}\n${colUnderline}\n\nno rows selected`;
  }

  // Calculate width for each column
  const colWidths = columns.map((col, idx) => {
    let max = col.length;
    for (const row of rows) {
      const val = row[idx] === null || row[idx] === undefined ? "" : String(row[idx]);
      if (val.length > max) max = val.length;
    }
    return Math.max(max, col.length, 4);
  });

  // Determine if column is numeric
  const isNumeric = columns.map((_, idx) => {
    return rows.every((row) => {
      const val = row[idx];
      return val === null || val === undefined || val === "" || !isNaN(Number(val));
    });
  });

  const headerLine = columns
    .map((col, idx) => {
      const w = colWidths[idx];
      return isNumeric[idx] ? col.toUpperCase().padStart(w, " ") : col.toUpperCase().padEnd(w, " ");
    })
    .join(" ");

  const underline = colWidths.map((w) => "-".repeat(w)).join(" ");

  const dataLines = rows.map((row) => {
    return row
      .map((val, idx) => {
        const str = val === null || val === undefined ? "" : String(val);
        const w = colWidths[idx];
        return isNumeric[idx] ? str.padStart(w, " ") : str.padEnd(w, " ");
      })
      .join(" ");
  });

  const countStr = rows.length === 1 ? "1 row selected." : `${rows.length} rows selected.`;
  return `${headerLine}\n${underline}\n${dataLines.join("\n")}\n\n${countStr}`;
}

export function simulateOracleSqlExecution(script: string): string {
  const output: string[] = [
    "SQL*Plus: Release 19.0.0.0.0 - Production on " + new Date().toDateString(),
    "Version 19.3.0.0.0",
    "Copyright (c) 1982, 2019, Oracle.  All rights reserved.\n",
    "Connected to:",
    "Oracle Database 19c Enterprise Edition Release 19.0.0.0.0 - Production\n",
  ];

  // Break script by semicolons or slash (/)
  const statements = script
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);

  if (statements.length === 0) {
    return output.join("\n") + "SQL> ";
  }

  for (const stmt of statements) {
    const stmtLines = stmt.split("\n").map((l) => l.trim()).filter(Boolean);
    if (stmtLines.length === 0) continue;

    stmtLines.forEach((l, idx) => {
      if (idx === 0) {
        output.push(`SQL> ${l}`);
      } else {
        output.push(`  ${idx + 1}  ${l}`);
      }
    });

    const upper = stmt.toUpperCase().trim();
    if (upper.startsWith("CREATE TABLE")) {
      output.push("\nTable created.\n");
    } else if (upper.startsWith("ALTER TABLE")) {
      output.push("\nTable altered.\n");
    } else if (upper.startsWith("DROP TABLE")) {
      output.push("\nTable dropped.\n");
    } else if (upper.startsWith("INSERT INTO")) {
      output.push("\n1 row created.\n");
    } else if (upper.startsWith("UPDATE ")) {
      output.push("\n1 row updated.\n");
    } else if (upper.startsWith("DELETE FROM") || upper.startsWith("DELETE ")) {
      output.push("\n1 row deleted.\n");
    } else if (upper.startsWith("COMMIT")) {
      output.push("\nCommit complete.\n");
    } else if (upper.startsWith("ROLLBACK")) {
      output.push("\nRollback complete.\n");
    } else if (upper.startsWith("SELECT")) {
      // Mock / parse output for standard lab queries
      const mockResult = generateMockSelectTable(stmt);
      output.push("\n" + mockResult + "\n");
    } else if (upper.startsWith("DESC ") || upper.startsWith("DESCRIBE ")) {
      const tableName = stmt.split(/\s+/)[1]?.replace(";", "") || "TABLE";
      output.push(`\nName                                      Null?    Type`);
      output.push(`----------------------------------------- -------- ----------------------------`);
      output.push(`${tableName.toUpperCase()}_ID                              NOT NULL NUMBER(6)`);
      output.push(`${tableName.toUpperCase()}_NAME                                      VARCHAR2(30)`);
      output.push(`CREATED_DATE                                       DATE\n`);
    } else {
      output.push("\nCommand executed successfully.\n");
    }
  }

  output.push("SQL> ");
  return output.join("\n");
}

function generateMockSelectTable(selectQuery: string): string {
  const upper = selectQuery.toUpperCase();

  if (upper.includes("EMP") || upper.includes("EMPLOYEE")) {
    const columns = ["EMPNO", "ENAME", "JOB", "MGR", "HIREDATE", "SAL", "COMM", "DEPTNO"];
    const rows = [
      [7369, "SMITH", "CLERK", 7902, "17-DEC-80", 800, null, 20],
      [7499, "ALLEN", "SALESMAN", 7698, "20-FEB-81", 1600, 300, 30],
      [7521, "WARD", "SALESMAN", 7698, "22-FEB-81", 1250, 500, 30],
      [7566, "JONES", "MANAGER", 7839, "02-APR-81", 2975, null, 20],
      [7698, "BLAKE", "MANAGER", 7839, "01-MAY-81", 2850, null, 30],
      [7782, "CLARK", "MANAGER", 7839, "09-JUN-81", 2450, null, 10],
      [7839, "KING", "PRESIDENT", null, "17-NOV-81", 5000, null, 10],
      [7900, "JAMES", "CLERK", 7698, "03-DEC-81", 950, null, 30],
    ];
    return formatSqlPlusTable(columns, rows);
  }

  if (upper.includes("DEPT") || upper.includes("DEPARTMENT")) {
    const columns = ["DEPTNO", "DNAME", "LOC"];
    const rows = [
      [10, "ACCOUNTING", "NEW YORK"],
      [20, "RESEARCH", "DALLAS"],
      [30, "SALES", "CHICAGO"],
      [40, "OPERATIONS", "BOSTON"],
    ];
    return formatSqlPlusTable(columns, rows);
  }

  if (upper.includes("STUDENT") || upper.includes("MARKS") || upper.includes("STUD")) {
    const columns = ["ROLL_NO", "NAME", "BRANCH", "SEMESTER", "CGPA"];
    const rows = [
      [101, "AARAV SHARMA", "CSE", 4, 9.15],
      [102, "DIYA PATEL", "CSE", 4, 8.84],
      [103, "ROHAN IYER", "IT", 4, 8.42],
      [104, "SNEHA REDDY", "ECE", 4, 8.95],
      [105, "VIKRAM SINGH", "CSE", 4, 9.40],
    ];
    return formatSqlPlusTable(columns, rows);
  }

  // Generic fallback table
  const columns = ["ID", "RESULT_ITEM", "STATUS", "RECORD_TIMESTAMP"];
  const rows = [
    [1, "SAMPLE_OUTPUT_A", "ACTIVE", "18-OCT-26"],
    [2, "SAMPLE_OUTPUT_B", "VERIFIED", "18-OCT-26"],
    [3, "SAMPLE_OUTPUT_C", "PROCESSED", "18-OCT-26"],
  ];
  return formatSqlPlusTable(columns, rows);
}
