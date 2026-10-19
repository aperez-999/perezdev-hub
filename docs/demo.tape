# Records docs/demo.gif for the README.
#   brew install vhs        (https://github.com/charmbracelet/vhs)
#   npm run build && npm link
#   vhs docs/demo.tape
# Runs in a throwaway $HOME and repo, so it never touches your real setup.

Output docs/demo.gif

Set Shell "bash"
Set FontSize 15
Set Width 1100
Set Height 720
Set Padding 20
Set TypingSpeed 40ms
Set Theme "GitHub Dark"

Hide
Type "export HOME=$(mktemp -d) && mkdir -p $HOME/.claude && cd $(mktemp -d) && git init -q"
Enter
Type `echo '{"scripts":{"build":"tsc","test":"vitest"},"dependencies":{"express":"4"},"devDependencies":{"vitest":"2"}}' > package.json && clear`
Enter
Show

Type "perezdev"
Enter
Sleep 2.5s

Type "perezdev init -y"
Enter
Sleep 6s

Type "clear && echo 'skip the tests' >> .claude/skills/express-reviewer/SKILL.md"
Enter
Sleep 500ms

Type "perezdev doctor"
Enter
Sleep 3s

Type "perezdev doctor --fix"
Enter
Sleep 3s
