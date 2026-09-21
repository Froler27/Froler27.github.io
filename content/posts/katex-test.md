---
title: "KaTeX 渲染测试"
date: 2026-09-22
math: true
draft: false
tags: ["测试"]
summary: "验证数学公式渲染链路（临时页面，验证后删除）"
---

行内公式测试：法线变换矩阵是 $M^{-\mathsf T}$，约束是 $\mathbf{n} \cdot \mathbf{t} = 0$。

块级公式测试：

$$N = (M^{-1})^{\mathsf T} = M^{-\mathsf T}$$

混合测试：伴随矩阵 $\operatorname{adj}(M)$ 满足 $\operatorname{adj}(M) = (\det M)\, M^{-1}$，当 $\det M = 0$ 时逆不存在。

上下标与希腊字母：$A_{ij}$ · $x^{2}$ · $\lambda I$ · $\mathbf{n}'$

一段在 Markdown 里容易出问题的写法（下划线与星号不会被吃掉）：$M^{-\mathsf T} \mathbf{n}$ 和 $\mathbf{t}' = M\mathbf{t}$
