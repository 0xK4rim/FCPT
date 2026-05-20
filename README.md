# FCPT

A Firefox extension that extracts sample test cases from competitive programming problems on Codeforces and AtCoder, then sends them directly to a Neovim plugin to automatically test your C++ solution against all samples.

## Installation

1- Install the firefox extension from [here](https://addons.mozilla.org/en-US/firefox/addon/cf-ac-sample-cases-copier/)

2- Now add the neovim plugin to your configs. For lazy:
```lua
{
  "0xK4rim/FCPT.nvim",
  config = function()
    require("FCPT").setup({
      test_file = "dir/sample-cases.txt", --Replace dir with your firefox's default download path
      sanitizer = true,
    })
  end,
}
