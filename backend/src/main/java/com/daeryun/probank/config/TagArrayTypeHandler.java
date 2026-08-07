package com.daeryun.probank.config;

import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;

import java.sql.Array;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/**
 * PostgreSQL {@code text[]} 컬럼(예: {@code array_agg(tags.name)})을
 * {@code List<String>}으로 오가는 MyBatis 타입 핸들러.
 *
 * ProblemMapper.xml 의 findAll 결과맵(problemListItemMap)에서 태그 배열
 * 컬럼을 매핑하는 데 쓰인다.
 */
@MappedTypes(List.class)
public class TagArrayTypeHandler extends BaseTypeHandler<List<String>> {

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, List<String> parameter, JdbcType jdbcType) throws SQLException {
        Array array = ps.getConnection().createArrayOf("text", parameter.toArray());
        ps.setArray(i, array);
    }

    @Override
    public List<String> getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return toList(rs.getArray(columnName));
    }

    @Override
    public List<String> getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return toList(rs.getArray(columnIndex));
    }

    @Override
    public List<String> getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return toList(cs.getArray(columnIndex));
    }

    private List<String> toList(Array sqlArray) throws SQLException {
        if (sqlArray == null) {
            return new ArrayList<>();
        }
        Object[] raw = (Object[]) sqlArray.getArray();
        List<String> result = new ArrayList<>(raw.length);
        for (Object o : raw) {
            result.add(o == null ? null : o.toString());
        }
        return result;
    }
}
