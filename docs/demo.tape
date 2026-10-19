# The README demo. Render it with docs/render-demo.sh, which records this tape
# with VHS (https://github.com/charmbracelet/vhs) and adds the zoom.
# Uses the local build and a throwaway $HOME and repo, so it never touches your real setup.

Output "/tmp/perezdev-demo.mp4"

Set Shell "bash"
Set FontSize 20
Set LineHeight 1.25
Set Width 1280
Set Height 800
Set Padding 26
Set Margin 36
Set MarginFill "#6D5BD0"
Set WindowBar Colorful
Set BorderRadius 12
Set Framerate 30
Set TypingSpeed 32ms
Set CursorBlink false
Set Theme "GitHub Dark"

Hide
Type `perezdev() { node "$PD/dist/index.js" "$@"; }; PD=$PWD; export PS1="\[\e[38;5;141m\]❯\[\e[0m\] "`
Enter
Type "export HOME=$(mktemp -d) && mkdir -p $HOME/.claude && cd $(mktemp -d) && git init -q"
Enter
Type `echo '{"scripts":{"build":"tsc","test":"vitest"},"dependencies":{"express":"4"},"devDependencies":{"vitest":"2"}}' > package.json && clear`
Enter
Show

# Scene 1: a fresh repo
Type "# A fresh Express repo. What does perezdev see?"
Sleep 600ms
Enter
Type "perezdev"
Sleep 300ms
Enter
Sleep 3s

# Scene 2: set it up
Hide
Type "clear"
Enter
Show
Type "# Set up agents for every AI tool you use"
Sleep 600ms
Enter
Type "perezdev init -y"
Sleep 300ms
Enter
Sleep 4.5s

# Scene 3: what's installed
Hide
Type "clear"
Enter
Show
Type "# Skills, MCP servers, AGENTS.md — all tracked"
Sleep 600ms
Enter
Type "perezdev"
Sleep 300ms
Enter
Sleep 3.5s

# Scene 4: drift caught and fixed
Hide
Type "clear"
Enter
Show
Type "# Someone edits a generated skill by hand…"
Sleep 600ms
Enter
Type "echo 'skip the tests' >> .claude/skills/express-reviewer/SKILL.md"
Sleep 300ms
Enter
Sleep 800ms
Type "perezdev doctor"
Sleep 300ms
Enter
Sleep 3s
Type "perezdev doctor --fix"
Sleep 300ms
Enter
Sleep 4s
