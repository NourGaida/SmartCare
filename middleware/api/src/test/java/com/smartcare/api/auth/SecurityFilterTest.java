package com.smartcare.api.auth;

import com.smartcare.iam.auth.AuthService;
import com.smartcare.iam.auth.Pbkdf2PasswordHasher;
import com.smartcare.iam.session.Session;
import com.smartcare.iam.session.SessionService;
import com.smartcare.iam.session.SessionSettings;
import com.smartcare.persistence.LoginAttemptRepository;
import com.smartcare.persistence.SessionRepository;
import com.smartcare.persistence.UserRepository;
import com.mongodb.MongoClientSettings;
import com.mongodb.ConnectionString;
import com.mongodb.client.MongoClients;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.core.*;
import org.bson.Document;
import org.junit.jupiter.api.*;

import java.io.InputStream;
import java.net.URI;
import java.util.*;
import java.util.function.Predicate;

import static org.junit.jupiter.api.Assertions.*;

class SecurityFilterTest {

    static com.mongodb.client.MongoClient client;
    static com.mongodb.client.MongoDatabase db;

    @BeforeAll
    static void setup() {
        client = MongoClients.create(MongoClientSettings.builder()
                .applyConnectionString(new ConnectionString("mongodb://localhost:27017"))
                .applyToClusterSettings(b -> b.serverSelectionTimeout(2000, java.util.concurrent.TimeUnit.MILLISECONDS))
                .build());
        try { client.getDatabase("admin").runCommand(new Document("ping", 1)); }
        catch (Exception e) { Assumptions.abort("MongoDB not reachable"); }
        db = client.getDatabase("smartcare_test_auth");
    }
    @AfterAll static void tearDown(){ if(client!=null) client.close(); }
    @BeforeEach void clean(){ db.drop(); }

    private SecurityFilter filter() {
        SecurityFilter f = new SecurityFilter();
        f.sessionService = new SessionService(new SessionRepository(db), SessionSettings.defaults());
        return f;
    }

    @Test
    void publicHealthRoutesPassWithoutSession_fullRuntimePathShape() throws Exception {
        // full runtime path shape: UriInfo.getPath() may be "health" or "/health"
        for (String path : List.of("/health", "health", "/health/database", "health/database", "/health/ingestion", "health/ingestion")) {
            TestCtx ctx = new TestCtx(path, "GET");
            filter().filter(ctx);
            assertFalse(ctx.aborted, "should be public: " + path);
        }
    }

    @Test
    void publicLoginRoutePassesWithoutSession_fullRuntimePathShape() throws Exception {
        for (String path : List.of("/auth/login", "auth/login")) {
            TestCtx ctx = new TestCtx(path, "POST");
            filter().filter(ctx);
            assertFalse(ctx.aborted, "login should be public: " + path);
        }
    }

    @Test
    void protectedRouteReturns401WithoutSession() throws Exception {
        for (String path : List.of("/session", "session", "/me/device", "/admin/accounts")) {
            TestCtx ctx = new TestCtx(path, "GET");
            filter().filter(ctx);
            assertTrue(ctx.aborted, "should be protected: " + path);
            assertEquals(401, ctx.abortStatus);
            assertTrue(String.valueOf(ctx.abortEntity).contains("\"error\":\"unauthorized\""));
        }
    }

    @Test
    void doesNotPubliclyMatchSimilarOrTraversalPaths() throws Exception {
        // exact-match only: similar, suffixed, traversal-like and logout are not public
        for (String path : List.of("/healthXYZ", "healthXYZ", "/health/../admin", "health/../admin",
                "/health/database/extra", "/auth/loginextra", "/auth/logout")) {
            TestCtx ctx = new TestCtx(path, path.contains("logout") ? "POST" : "GET");
            filter().filter(ctx);
            assertTrue(ctx.aborted, "must not be public: " + path);
            assertEquals(401, ctx.abortStatus);
        }
    }

    @Test
    void loginWithWrongPasswordReturnsInvalidCredentialsFromLoginCode_notFilter() {
        // proves /auth/login is not blocked by filter; AuthResource/AuthService returns invalid_credentials
        var hasher = new Pbkdf2PasswordHasher();
        db.getCollection("users").insertOne(new Document("userId", "u1")
                .append("email", "u1@example.com")
                .append("passwordHash", hasher.hash("secret"))
                .append("role", "PATIENT").append("active", true).append("createdAt", new Date()));
        UserRepository users = new UserRepository(db);
        LoginAttemptRepository attempts = new LoginAttemptRepository(db);
        SessionService sessions = new SessionService(new SessionRepository(db), SessionSettings.defaults());
        AuthService auth = new AuthService(users, attempts, hasher, sessions);
        try {
            auth.login("u1@example.com", "wrong", "127.0.0.1");
            fail("expected LoginException");
        } catch (com.smartcare.iam.auth.LoginException e) {
            assertEquals(401, e.status());
            assertEquals("invalid_credentials", e.code());
        }
        // and filter would let POST /auth/login through
        TestCtx ctx = new TestCtx("/auth/login", "POST");
        try { filter().filter(ctx); } catch (Exception ex) { fail(ex); }
        assertFalse(ctx.aborted);
    }

    static class TestCtx implements ContainerRequestContext {
        boolean aborted; int abortStatus; Object abortEntity; final String path; final String method;
        final Map<String, Cookie> cookies = new HashMap<>(); final Map<String, Object> props = new HashMap<>();
        final MultivaluedHashMap<String, String> headers = new MultivaluedHashMap<>();
        TestCtx(String path, String method){ this.path=path; this.method=method; }
        @Override public Object getProperty(String name){ return props.get(name); }
        @Override public Collection<String> getPropertyNames(){ return props.keySet(); }
        @Override public void setProperty(String name, Object object){ props.put(name, object); }
        @Override public void removeProperty(String name){ props.remove(name); }
        @Override public UriInfo getUriInfo(){ return new UriInfo(){
            @Override public String getPath(){ return path; }
            @Override public String getPath(boolean decode){ return path; }
            @Override public List<PathSegment> getPathSegments(){ return List.of(); }
            @Override public List<PathSegment> getPathSegments(boolean decode){ return List.of(); }
            @Override public URI getRequestUri(){ return URI.create("http://localhost/smartcare/api/"+path.replaceFirst("^/","")); }
            @Override public UriBuilder getRequestUriBuilder(){ return UriBuilder.fromUri(getRequestUri()); }
            @Override public URI getAbsolutePath(){ return getRequestUri(); }
            @Override public UriBuilder getAbsolutePathBuilder(){ return UriBuilder.fromUri(getAbsolutePath()); }
            @Override public URI getBaseUri(){ return URI.create("http://localhost/smartcare/api/"); }
            @Override public UriBuilder getBaseUriBuilder(){ return UriBuilder.fromUri(getBaseUri()); }
            @Override public MultivaluedMap<String,String> getPathParameters(){ return new MultivaluedHashMap<>(); }
            @Override public MultivaluedMap<String,String> getPathParameters(boolean decode){ return new MultivaluedHashMap<>(); }
            @Override public MultivaluedMap<String,String> getQueryParameters(){ return new MultivaluedHashMap<>(); }
            @Override public MultivaluedMap<String,String> getQueryParameters(boolean decode){ return new MultivaluedHashMap<>(); }
            @Override public List<String> getMatchedURIs(){ return List.of(); }
            @Override public List<String> getMatchedURIs(boolean decode){ return List.of(); }
            @Override public List<Object> getMatchedResources(){ return List.of(); }
            @Override public URI resolve(URI uri){ return uri; }
            @Override public URI relativize(URI uri){ return uri; }
            @Override public String getMatchedResourceTemplate() { return ""; }
        }; }
        @Override public void setRequestUri(URI requestUri){}
        @Override public void setRequestUri(URI baseUri, URI requestUri){}
        @Override public Request getRequest(){ return null; }
        @Override public String getMethod(){ return method; }
        @Override public void setMethod(String method){}
        @Override public MultivaluedMap<String,String> getHeaders(){ return headers; }
        @Override public String getHeaderString(String name){ return headers.getFirst(name); }
        @Override public Date getDate(){ return null; }
        @Override public Locale getLanguage(){ return null; }
        @Override public int getLength(){ return -1; }
        @Override public MediaType getMediaType(){ return null; }
        @Override public List<MediaType> getAcceptableMediaTypes(){ return List.of(MediaType.WILDCARD_TYPE); }
        @Override public List<Locale> getAcceptableLanguages(){ return List.of(); }
        @Override public Map<String,Cookie> getCookies(){ return cookies; }
        @Override public boolean hasEntity(){ return false; }
        @Override public InputStream getEntityStream(){ return InputStream.nullInputStream(); }
        @Override public void setEntityStream(InputStream input){}
        @Override public SecurityContext getSecurityContext(){ return null; }
        @Override public void setSecurityContext(SecurityContext context){}
        @Override public void abortWith(Response response){ aborted=true; abortStatus=response.getStatus(); abortEntity=response.getEntity(); }
        @Override public boolean containsHeaderString(String name, String valueSeparatorRegex, Predicate<String> valuePredicate) {
            String v = getHeaderString(name);
            if (v == null) return false;
            for (String p : v.split(valueSeparatorRegex == null ? "," : valueSeparatorRegex)) {
                if (valuePredicate.test(p.trim())) return true;
            }
            return false;
        }
    }
}
