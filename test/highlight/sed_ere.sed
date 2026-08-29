#note
# <- keyword.directive
#^ keyword.directive
# ^ comment

# comment
# <- comment
# ^ comment

  1,$!p;
# ^ number
#  ^ punctuation.delimiter
#   ^ constant.builtin
#    ^ operator
#     ^ keyword
#      ^ punctuation.delimiter

  s/^(ab|c)+d{2,3}e?f*/x/gipw output
# ^ keyword
#  ^ punctuation.delimiter
#   ^ operator
#    ^ punctuation.bracket
#     ^^ string.regexp
#       ^ operator
#        ^ string.regexp
#         ^ punctuation.bracket
#          ^ operator
#           ^ string.regexp
#            ^ punctuation.bracket
#             ^ number
#              ^ punctuation.delimiter
#               ^ number
#                ^ punctuation.bracket
#                 ^ string.regexp
#                  ^ operator
#                   ^ string.regexp
#                    ^ operator
#                     ^ punctuation.delimiter
#                      ^ string
#                       ^ punctuation.delimiter
#                        ^^^^ keyword.modifier
#                             ^^^^^^ string.special.path

  \%a\%%p
# ^ string.escape
#  ^ punctuation.delimiter
#   ^ string.regexp
#    ^^ string.escape
#      ^ punctuation.delimiter
#       ^ keyword

  /a\./p
# ^ punctuation.delimiter
#  ^ string.regexp
#   ^^ string.escape
#     ^ punctuation.delimiter
#      ^ keyword

  s|a|\&\\|
# ^ keyword
#  ^ punctuation.delimiter
#   ^ string.regexp
#    ^ punctuation.delimiter
#     ^^^^ string.escape
#         ^ punctuation.delimiter

  s/a/b/2
# ^ keyword
#  ^ punctuation.delimiter
#   ^ string.regexp
#    ^ punctuation.delimiter
#     ^ string
#      ^ punctuation.delimiter
#       ^ number

  s/a/b/wg2 output
# ^ keyword
#  ^ punctuation.delimiter
#   ^ string.regexp
#    ^ punctuation.delimiter
#     ^ string
#      ^ punctuation.delimiter
#       ^^ keyword.modifier
#         ^ number
#           ^^^^^^ string.special.path

  y|a\n\||b\\c|
# ^ keyword
#  ^ punctuation.delimiter
#   ^ string
#    ^^ string.escape
#      ^^ string.escape
#        ^ punctuation.delimiter
#         ^ string
#          ^^ string.escape
#            ^ string
#             ^ punctuation.delimiter

  /[^]a-c[:alpha:][.].][=a=]-]/p
# ^ punctuation.delimiter
#  ^ punctuation.bracket
#   ^ punctuation.special
#    ^ character.special
#     ^ character.special
#      ^ punctuation.special
#       ^ character.special
#        ^^ punctuation.bracket
#          ^^^^^ character.special
#               ^^ punctuation.bracket
#                 ^^^^^ character.special
#                      ^^^^^ character.special
#                           ^ string.regexp
#                            ^ punctuation.bracket
#                             ^ punctuation.delimiter
#                              ^ keyword

  /[%--]/p
# ^ punctuation.delimiter
#  ^ punctuation.bracket
#   ^ character.special
#    ^ punctuation.special
#     ^ string.regexp
#      ^ punctuation.bracket
#       ^ punctuation.delimiter
#        ^ keyword

  {p;}
# ^ punctuation.bracket
#  ^ keyword
#   ^ punctuation.delimiter
#    ^ punctuation.bracket

  p
#  ^ !punctuation.delimiter

  a\
#  ^ punctuation.special
