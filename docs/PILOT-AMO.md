# A.M.O. Brewery — preparação do piloto

Atualizado em 20 de outubro de 2026, com os dados fornecidos pelo utilizador. **Três produtos e respetivos preços foram comunicados para preparar o piloto; a ativação continua pendente dos restantes dados e condições.** Não foi criada uma loja ativa, inventado stock ou alterado o catálogo público. Os dados estruturados estão em [amo-draft.json](pilot/amo-draft.json), sem execução automática ou importação para a base de dados.

## Dados recebidos

| Campo            | Informação                                            | Confirmação necessária                                          |
| ---------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| Nome             | A A.M.O. Brewery                                      | Entidade legal e responsável pelo piloto                        |
| Recolha proposta | Rua Bernardim Ribeiro, 53, Lisboa, 1150-069, Portugal | Porta/local de recolha, instruções e autorização para estafetas |
| Segunda a sexta  | 09:00–15:00                                           | Janela adicional confirmada pelo utilizador                     |
| Terça a quinta   | 16:00–22:00                                           | Hora limite de pedidos/recolhas                                 |
| Sexta e sábado   | 16:00–00:00                                           | Fecho à meia-noite                                              |
| Domingo          | Encerrado                                             | Encerramento confirmado pelo utilizador                         |
| Oferta recebida  | Três cervejas em garrafa de 33 cl, listadas abaixo    | Stock, informação de produto e disponibilidade para entrega     |
| Zona proposta    | Raio de 3 km; Arroios, Saldanha, Graça e Baixa        | Códigos postais completos aprovados e elegibilidade Uber Direct |

Os novos horários substituem as referências anteriores de abertura às 17:00. O utilizador confirmou as janelas cumulativas: segunda 09:00–15:00; terça a quinta 09:00–15:00 e 16:00–22:00; sexta 09:00–15:00 e 16:00–00:00; sábado 16:00–00:00. Domingo está confirmado como encerrado. No formato técnico, `00:00` representa o fecho à meia-noite da janela iniciada às 16:00; não uma abertura durante o domingo.

Um raio de 3 km ou o nome de um bairro não substitui a lista de códigos postais de entrega; essa lista continua vazia.

## Produtos e preços recebidos

| Produto         | Formato          | Preço por unidade | Cêntimos | Referência interna Ruvon proposta |
| --------------- | ---------------- | ----------------: | -------: | --------------------------------- |
| Most wanted IPA | Garrafa de 33 cl |            4,50 € |      450 | `amo-most-wanted-ipa-330`         |
| Borboletas APA  | Garrafa de 33 cl |            4,00 € |      400 | `amo-borboletas-apa-330`          |
| Alley Cat Amber | Garrafa de 33 cl |            4,00 € |      400 | `amo-alley-cat-amber-330`         |

Os três preços **incluem IVA de 23%, conforme comunicado pelo utilizador**. Substituem o intervalo indicativo anterior de 5–6 €; não se soma novamente IVA ao valor comunicado. As referências são identificadores internos propostos para a Ruvon, não códigos de fabricante confirmados.

O stock, peso/dimensões de transporte, classificação explícita de álcool/verificação de idade e ingredientes/alergénios ainda não foram fornecidos. Esses campos estão `null` no rascunho, não zero ou valores estimados. Os artigos continuam desativados e não foram inseridos no catálogo operacional. Não se criam mais variedades a partir da referência anterior a 10–12 cervejas.

## Catálogo e packs

A oferta descrita não confirma os ingredientes dos packs de festa atuais. O utilizador escolheu em 20 de outubro um **piloto de cervejas artesanais da A.M.O.**, com packs construídos a partir do catálogo que a loja confirmar. Esta escolha define a direção do piloto, mas não aprova produtos ou preços ainda desconhecidos. Os packs de festa atuais não são oferecidos como se a A.M.O. tivesse os respetivos ingredientes; as receitas existentes continuam inalteradas até existir um catálogo confirmado.

Para cada SKU, completar: stock inicial em garrafas; peso e dimensões de transporte; classificação explícita de álcool e verificação de idade; disponibilidade; e ingredientes/alergénios necessários à informação ao cliente. Confirmar separadamente embalagens, sacos, selos e qualquer produto complementar. Não deduzir teor alcoólico ou conformidade a partir do nome da cerveja.

Só depois se podem resolver packs em receitas de SKUs reais, somar os preços da loja e reservar o stock partilhado entre packs e artigos individuais. Não há ainda composições ou quantidades de packs aprovadas; nenhum pack foi inventado. O rascunho com os três preços recebidos não é um seed executável.

O fluxo commerce já permite referências próprias da loja, separadas do catálogo de validação: cada unidade usa um ID `sku:<referência>`, o nome/unidade da ficha de stock e o preço dessa loja. O servidor valida disponibilidade e agrega o mesmo stock quando uma receita de pack usa essa referência. O carrinho e a cotação recuperam estes artigos após atualização da página. Isto prepara a entrada do catálogo confirmado; não cria cervejas ou packs A.M.O. por antecipação nem ativa o checkout.

## Operação e condições por fechar

- Contacto de operações da loja: nome, email monitorizado e telemóvel português, com aprovação dos avisos de pedidos.
- Pessoas que usarão o painel, contas Supabase pessoais e respetivas permissões.
- Aceitação em três minutos, confirmação integral do stock, preparação apenas depois de captura e booking confirmados, e confirmação de selo/pronto para recolha.
- Tempo de preparação, capacidade simultânea, regras de pausa e presença no painel para manter o heartbeat.
- Comissão prevista no plano, condições aceites pela loja, identificação/faturação, responsabilidade por indisponibilidade, danos e devoluções, e acordo de recuperação de valores.
- Onboarding e conta beneficiária Easypay, prova de retenção/clearing e correlação com pagamento bancário.
- Recolha e receção de devoluções; confirmação de quantidades vendáveis/danificadas antes de qualquer reposição.
- Aprovação Uber para morada, área, álcool, identificação e devoluções. O utilizador aguarda contacto do Uber em 1–3 dias; não há credenciais de teste configuradas.

Nenhuma mensagem foi enviada à loja. A ativação continua dependente destas confirmações, dos contratos dos prestadores e dos testes reais descritos em [PRODUCTION-PILOT.md](PRODUCTION-PILOT.md).
