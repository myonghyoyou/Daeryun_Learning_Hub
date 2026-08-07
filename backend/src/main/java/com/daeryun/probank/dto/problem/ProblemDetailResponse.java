package com.daeryun.probank.dto.problem;

import com.daeryun.probank.domain.Problem;
import com.daeryun.probank.domain.ProblemChoice;
import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.domain.ProblemType;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

@Data
@AllArgsConstructor
public class ProblemDetailResponse {
    private Long id;
    private ProblemType type;
    private String content;
    private String imageUrl;
    private String referenceText;
    private String explanation;
    private Integer blankRevealCount;
    private ProblemStatus status;
    private Long departmentId;
    private List<ProblemChoice> choices;
    private List<String> answers;
    private List<com.daeryun.probank.domain.ProblemBlank> blanks;
    private List<String> tags;

    public static ProblemDetailResponse of(Problem problem, List<ProblemChoice> choices,
                                            List<String> answers, List<com.daeryun.probank.domain.ProblemBlank> blanks,
                                            List<String> tags) {
        return new ProblemDetailResponse(
                problem.getId(), problem.getType(), problem.getContent(), problem.getImageUrl(),
                problem.getReferenceText(), problem.getExplanation(), problem.getBlankRevealCount(),
                problem.getStatus(), problem.getDepartmentId(), choices, answers, blanks, tags);
    }
}
