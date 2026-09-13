# TASK-0106: Investigate Windows Test Process Crashes

## Problem
The full test suite has process-level crashes on Windows with exit code 3221225477 (0xC0000005).

## Goal
Find the smallest reproducible cause and fix it without changing unrelated production behavior.
