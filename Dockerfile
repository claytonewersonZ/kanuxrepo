FROM maven:3.9.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY backend/pom.xml .
RUN mvn dependency:go-offline
COPY backend/src ./src
RUN mvn clean package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=builder /app/target/kanux-backend.jar /app/kanux-backend.jar
EXPOSE 10000
ENTRYPOINT ["java", "-Xms128m", "-Xmx256m", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0", "-jar", "/app/kanux-backend.jar"]
