local repository = 'https://github.com/konomanoasa/tree-sitter-sed'
local languages = {
  sed = {},
  sed_gnu_bre = { location = 'gnu-bre' },
  sed_gnu_ere = { location = 'gnu-ere' },
  sed_posix_bre = { location = 'posix-bre' },
  sed_posix_ere = { location = 'posix-ere' },
}

local function register()
  local ok, parsers = pcall(require, 'nvim-treesitter.parsers')
  if not ok then
    return
  end

  for language, options in pairs(languages) do
    parsers[language] = {
      install_info = vim.tbl_extend('force', { url = repository }, options),
    }
  end
end

register()

local group = vim.api.nvim_create_augroup('tree_sitter_sed', { clear = true })
vim.api.nvim_create_autocmd('User', {
  group = group,
  pattern = 'TSUpdate',
  callback = register,
})
