 s/^a.\.\n$/x/
#  ^ operator
#    ^ character.special
#     ^^ string.escape
#       ^^ string.escape
#         ^ operator

 s/[^a-z][[:digit:]]/x/
#  ^ punctuation.bracket
#   ^ operator
#    ^^^ character.special
#       ^ punctuation.bracket
#        ^ punctuation.bracket
#         ^^^^^^^^^ character.special
#                  ^ punctuation.bracket
